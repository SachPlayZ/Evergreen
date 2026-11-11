/**
 * Starts a local NEAR sandbox and deploys the Top Level Accounts contracts
 * (unmodified, prebuilt from houseofstake/tla-contracts @ d85860a), plus the
 * DEMO staking pool. Mirrors the upstream integration harness.
 *
 * DEMO SETTINGS: Leases and Grace are seconds long, and the pool pays rewards
 * on demand. Real Leases run a year and real pools pay about 5% a year.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Account, baseEncode } from "near-api-js";
import { DEFAULT_PRIVATE_KEY, GenesisAccount, Sandbox } from "near-sandbox";
import { Evergreen, ONE_YOCTO, call, nearToYocto } from "@evergreen-names/client";

const WASM_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../contracts/wasm");
const GLOBAL_CODE_COST_PER_BYTE = 100_000_000_000_000_000_000n;
/** Same nearcore release the upstream Rust harness runs against. */
const SANDBOX_VERSION = "2.13.0";

export const IDS = {
  council: "council",
  patch: "patch",
  registry: "registry",
  extension: "ext",
  recovery: "rec",
  walletImpl: "wimpl",
  /** The demo Namespace. Names look like `alice.demo`. */
  namespace: "demo",
  relay: "relay",
  pool: "pool",
} as const;

export interface SandboxOptions {
  /** Lease length in seconds. The registry's minimum is 60. */
  leaseSecs?: number;
  graceSecs?: number;
  /** Extra funded accounts to create at genesis (people in your scenario). */
  people?: string[];
  nearUsd?: number;
}

export interface EvergreenSandbox {
  rpcUrl: string;
  registryId: string;
  namespace: string;
  poolId: string;
  leaseSecs: number;
  graceSecs: number;
  client: Evergreen;
  /** Any genesis account, able to sign. */
  account(id: string): Account;
  stewardWasm: Uint8Array;
  /** DEMO ONLY: credits staking rewards to a Name in the demo pool. */
  dripReward(name: string, amountYocto: bigint): Promise<void>;
  /** The price oracle is just an account. Refreshes the NEAR/USD rate (it goes stale after 6h). */
  refreshRate(): Promise<void>;
  /** Moves chain time forward by at least `secs`. */
  advance(secs: number): Promise<void>;
  /** Waits (real time) until chain time reaches `ns`. */
  waitUntil(ns: bigint): Promise<void>;
  /** NEAR held directly by an account, in yoctoNEAR. */
  balanceOf(id: string): Promise<bigint>;
  /** Makes a Name call a contract through its wallet, signed by its Owner. */
  walletCall(
    owner: Account,
    name: string,
    receiver: string,
    method: string,
    args?: Record<string, unknown>,
    depositYocto?: bigint,
  ): Promise<void>;
  /** Reclaims an expired Name, as anyone can once Grace has ended. */
  reclaim(name: string): Promise<void>;
  stop(): Promise<void>;
}

export function wasm(name: string): Uint8Array {
  return readFileSync(join(WASM_DIR, `${name}.wasm`));
}

/** Where each part of the stack lives. On the sandbox these are genesis accounts; on testnet, sub-accounts. */
export type StackIds = { [K in keyof typeof IDS]: string };

export interface StackOptions {
  ids: StackIds;
  client: Evergreen;
  /** An account able to sign for any id in `ids`. */
  account(id: string): Account;
  leaseSecs: number;
  graceSecs: number;
  nearUsdMicro: number;
  /** Multiplies every Rent tier. Testnet uses a small one so a demo Lease costs cents of testnet NEAR. */
  rentScale?: number;
  /** Runs one named step. Testnet uses it to skip steps that already ran. */
  step?: (name: string, run: () => Promise<void>) => Promise<void>;
}

/** NEAR attached to publish the shared wallet code as a global contract. */
export function walletCodeDepositYocto(): bigint {
  return BigInt(wasm("hos_wallet").length) * GLOBAL_CODE_COST_PER_BYTE;
}

/** Deploys and wires the Top Level Accounts contracts and the demo pool, as the upstream harness does. */
export async function deployStack(o: StackOptions): Promise<void> {
  const { ids, client, account } = o;
  const step = o.step ?? ((_name: string, run: () => Promise<void>) => run());
  const council = account(ids.council);
  const relay = account(ids.relay);
  const ns = (secs: number) => (BigInt(secs) * 1_000_000_000n).toString();

  // Shared wallet code, published as a global contract after council approval.
  await step("wallet deployer", async () => {
    const deployer = account(ids.walletImpl);
    await deployer.deployContract(wasm("wallet_impl_deployer"));
    await call(deployer, ids.walletImpl, "new", {
      council: ids.council,
      patch_authority: ids.patch,
      approval_delay_ns: "0",
    });
  });
  const walletWasm = wasm("hos_wallet");
  await step("wallet code approved", async () => {
    const walletHash = baseEncode(createHash("sha256").update(walletWasm).digest());
    await call(council, ids.walletImpl, "gd_approve", { hash: walletHash }, { deposit: ONE_YOCTO });
  });
  await step("wallet code published", async () => {
    await call(
      relay,
      ids.walletImpl,
      "gd_deploy",
      { code: Buffer.from(walletWasm).toString("base64") },
      { deposit: walletCodeDepositYocto() },
    );
  });

  // The Namespace account runs the registrar.
  await step("registrar", async () => {
    const registrar = account(ids.namespace);
    await registrar.deployContract(wasm("registrar"));
    await call(registrar, ids.namespace, "new", {
      config: {
        registry: ids.registry,
        council: ids.council,
        wallet_impl: ids.walletImpl,
        hos_extension: ids.extension,
        recovery: ids.recovery,
        chain_id: "testnet",
        min_balance: nearToYocto("0.1").toString(),
        wallet_timeout_secs: 3600,
      },
    });
  });

  await step("extension", async () => {
    const extension = account(ids.extension);
    await extension.deployContract(wasm("hos_extension"));
    await call(extension, ids.extension, "new", {
      admin: ids.council,
      registry: ids.registry,
      recovery: ids.recovery,
      treasury: ids.council,
      council: ids.council,
    });
  });

  await step("recovery", async () => {
    const recovery = account(ids.recovery);
    await recovery.deployContract(wasm("mpc_recovery"));
    await call(recovery, ids.recovery, "new", {
      owner: ids.council,
      signer: ids.relay,
      transfer_authority: ids.extension,
      watchers: [
        "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847",
        "ed25519:5BGSaf6YjVm7565VzWQHNxoyEjwr3jUpRJSGjREvU9dB",
      ],
      threshold: 2,
    });
  });

  await step("registry", async () => {
    const registry = account(ids.registry);
    await registry.deployContract(wasm("tla_registry"));
    await call(registry, ids.registry, "new", {
      admin: ids.council,
      hos_extension: ids.extension,
      grace_period_ns: ns(o.graceSecs),
      treasury: ids.council,
      council: ids.council,
      lease_term_ns: ns(o.leaseSecs),
    });
  });
  await step("rate", async () => {
    await call(council, ids.registry, "admin_set_initial_rate", { rate: String(o.nearUsdMicro) }, { deposit: ONE_YOCTO });
  });
  await step("namespace", async () => {
    await call(
      council,
      ids.registry,
      "register_tla",
      { tla_id: ids.namespace, tla_type: "Open", premium_category: "Standard", licensee: null },
      { deposit: ONE_YOCTO },
    );
    await call(council, ids.registry, "activate_open_tla", { tla_id: ids.namespace }, { deposit: ONE_YOCTO });
  });
  await step("fees", async () => {
    // As in the upstream harness: the one-off deposit that funds a new Name's account.
    const fee: any = await client.rpc.callFunction({ contractId: ids.registry, method: "get_fee_config", args: {} });
    fee.account_creation_deposit_yocto = nearToYocto("0.2").toString();
    if (o.rentScale !== undefined) {
      for (const tier of ["rent_tier_5_usd_micro", "rent_tier_8_usd_micro", "rent_tier_10_usd_micro", "rent_tier_12plus_usd_micro"]) {
        fee[tier] = String(Math.max(1, Math.round(Number(fee[tier]) * o.rentScale)));
      }
    }
    await call(council, ids.registry, "update_fee_config", { config: fee }, { deposit: ONE_YOCTO });
  });

  await step("pool", async () => {
    const pool = account(ids.pool);
    await pool.deployContract(wasm("demo_pool"));
    await call(pool, ids.pool, "new", {});
  });
}

export async function startSandbox(options: SandboxOptions = {}): Promise<EvergreenSandbox> {
  const leaseSecs = options.leaseSecs ?? 60;
  const graceSecs = options.graceSecs ?? 60;
  const nearUsdMicro = Math.round((options.nearUsd ?? 5) * 1e6);
  const ids = [...Object.values(IDS), ...(options.people ?? [])];
  const sandbox = await Sandbox.start({
    version: SANDBOX_VERSION,
    config: { additionalAccounts: ids.map((id) => GenesisAccount.createDefault(id)) },
  });
  const client = new Evergreen({ rpcUrl: sandbox.rpcUrl, registryId: IDS.registry });
  const account = (id: string) => client.account(id, DEFAULT_PRIVATE_KEY);
  const council = account(IDS.council);
  const relay = account(IDS.relay);
  await deployStack({ ids: IDS, client, account, leaseSecs, graceSecs, nearUsdMicro });

  const rpc = async (method: string, params: unknown) => {
    const res = await fetch(sandbox.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const body: any = await res.json();
    if (body.error) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
    return body.result;
  };

  return {
    rpcUrl: sandbox.rpcUrl,
    registryId: IDS.registry,
    namespace: IDS.namespace,
    poolId: IDS.pool,
    leaseSecs,
    graceSecs,
    client,
    account,
    stewardWasm: wasm("steward"),
    async dripReward(name, amountYocto) {
      await call(relay, IDS.pool, "drip_reward", { account_id: name }, { deposit: amountYocto });
    },
    async refreshRate() {
      await call(council, IDS.registry, "set_near_usd_rate", { rate: String(nearUsdMicro) }, { deposit: ONE_YOCTO });
    },
    async advance(secs) {
      const target = (await client.chainTimeNs()) + BigInt(secs) * 1_000_000_000n;
      while ((await client.chainTimeNs()) < target) {
        await rpc("sandbox_fast_forward", { delta_height: Math.max(10, secs * 2) });
        await new Promise((r) => setTimeout(r, 300));
      }
    },
    async waitUntil(ns) {
      while ((await client.chainTimeNs()) < ns) await new Promise((r) => setTimeout(r, 500));
    },
    async balanceOf(id) {
      return account(id).getBalance();
    },
    async walletCall(owner, name, receiver, method, args = {}, depositYocto = 0n) {
      const request = {
        external: [
          {
            receiver_id: receiver,
            actions: [
              {
                action: "function_call",
                payload: {
                  function_name: method,
                  args: Buffer.from(JSON.stringify(args)).toString("base64"),
                  deposit: depositYocto.toString(),
                  gas: "30000000000000",
                },
              },
            ],
          },
        ],
      };
      await call(owner, name, "w_execute_extension", { request }, { deposit: ONE_YOCTO });
    },
    async reclaim(name) {
      const dot = name.indexOf(".");
      await call(relay, IDS.registry, "reclaim_finalize", {
        tla_id: name.slice(dot + 1),
        name: name.slice(0, dot),
      });
    },
    async stop() {
      await sandbox.tearDown();
    },
  };
}
