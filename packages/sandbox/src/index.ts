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
  const ns = (secs: number) => (BigInt(secs) * 1_000_000_000n).toString();

  // Shared wallet code, published as a global contract after council approval.
  const deployer = account(IDS.walletImpl);
  await deployer.deployContract(wasm("wallet_impl_deployer"));
  await call(deployer, IDS.walletImpl, "new", {
    council: IDS.council,
    patch_authority: IDS.patch,
    approval_delay_ns: "0",
  });
  const walletWasm = wasm("hos_wallet");
  const walletHash = baseEncode(createHash("sha256").update(walletWasm).digest());
  await call(council, IDS.walletImpl, "gd_approve", { hash: walletHash }, { deposit: ONE_YOCTO });
  await call(
    relay,
    IDS.walletImpl,
    "gd_deploy",
    { code: Buffer.from(walletWasm).toString("base64") },
    { deposit: BigInt(walletWasm.length) * GLOBAL_CODE_COST_PER_BYTE },
  );

  // The Namespace account runs the registrar.
  const registrar = account(IDS.namespace);
  await registrar.deployContract(wasm("registrar"));
  await call(registrar, IDS.namespace, "new", {
    config: {
      registry: IDS.registry,
      council: IDS.council,
      wallet_impl: IDS.walletImpl,
      hos_extension: IDS.extension,
      recovery: IDS.recovery,
      chain_id: "testnet",
      min_balance: nearToYocto("0.1").toString(),
      wallet_timeout_secs: 3600,
    },
  });

  const extension = account(IDS.extension);
  await extension.deployContract(wasm("hos_extension"));
  await call(extension, IDS.extension, "new", {
    admin: IDS.council,
    registry: IDS.registry,
    recovery: IDS.recovery,
    treasury: IDS.council,
    council: IDS.council,
  });

  const recovery = account(IDS.recovery);
  await recovery.deployContract(wasm("mpc_recovery"));
  await call(recovery, IDS.recovery, "new", {
    owner: IDS.council,
    signer: IDS.relay,
    transfer_authority: IDS.extension,
    watchers: [
      "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847",
      "ed25519:5BGSaf6YjVm7565VzWQHNxoyEjwr3jUpRJSGjREvU9dB",
    ],
    threshold: 2,
  });

  const registry = account(IDS.registry);
  await registry.deployContract(wasm("tla_registry"));
  await call(registry, IDS.registry, "new", {
    admin: IDS.council,
    hos_extension: IDS.extension,
    grace_period_ns: ns(graceSecs),
    treasury: IDS.council,
    council: IDS.council,
    lease_term_ns: ns(leaseSecs),
  });
  await call(council, IDS.registry, "admin_set_initial_rate", { rate: String(nearUsdMicro) }, { deposit: ONE_YOCTO });
  await call(
    council,
    IDS.registry,
    "register_tla",
    { tla_id: IDS.namespace, tla_type: "Open", premium_category: "Standard", licensee: null },
    { deposit: ONE_YOCTO },
  );
  await call(council, IDS.registry, "activate_open_tla", { tla_id: IDS.namespace }, { deposit: ONE_YOCTO });
  // As in the upstream harness: the one-off deposit that funds a new Name's account.
  const fee: any = await client.rpc.callFunction({ contractId: IDS.registry, method: "get_fee_config", args: {} });
  fee.account_creation_deposit_yocto = nearToYocto("0.2").toString();
  await call(council, IDS.registry, "update_fee_config", { config: fee }, { deposit: ONE_YOCTO });

  const pool = account(IDS.pool);
  await pool.deployContract(wasm("demo_pool"));
  await call(pool, IDS.pool, "new", {});

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
