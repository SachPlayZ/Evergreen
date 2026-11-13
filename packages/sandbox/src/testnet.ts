/**
 * A real Evergreen Name on NEAR testnet, under one funded account, for about 17 testnet NEAR.
 *
 * House of Stake's own testnet registries cannot rent right now (their NEAR/USD oracle stopped),
 * so this runs its own Top Level Accounts registry, extension and registrar, built unmodified from
 * the same commit House of Stake runs on testnet (d12a84b, `contracts/wasm/d12a84b`). Every Name's
 * wallet runs House of Stake's own published wallet code (`impl.hosdemo.testnet`), so no wallet
 * code is published (that alone would burn 43 NEAR). The root account is admin, council, price
 * oracle and treasury. The Steward stakes in a real testnet validator's pool.
 *
 * REAL SETTINGS: one-year Leases and a one-day Grace (the minimum at d12a84b), real staking
 * rewards. DEMO SETTING: Rent is $0.00001 a year, so one epoch of real rewards covers it and the
 * Steward's first self-renewal lands within days (the pool's unstake delay is 4 epochs).
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type Account, KeyPair, type KeyPairString } from "near-api-js";
import { Evergreen, ONE_YOCTO, call, nearToYocto, yoctoToNear } from "@evergreen-names/client";
import { wasm } from "./index";

export const TESTNET_RPC = "https://test.rpc.fastnear.com";
/** House of Stake's wallet code on testnet, published as a global contract by account id. */
export const HOS_WALLET_CODE = "impl.hosdemo.testnet";
/** A real testnet validator's staking pool (standard staking-pool contract). */
export const TESTNET_POOL = "aurora.pool.f863973.m0";
const DAY = 86_400;
const NS = 1_000_000_000n;
const old = (name: string) => wasm(`d12a84b/${name}`);

/** Contract accounts, as sub-account prefixes, and the NEAR each starts with: measured code storage, the gas to deploy it, and some room. */
const CONTRACTS = [
  { role: "registry", prefix: "registry", near: "5.75" },
  { role: "extension", prefix: "ext", near: "2.75" },
  { role: "namespace", prefix: "ev", near: "2.25" },
  { role: "recovery", prefix: "rec", near: "2.9" },
] as const;
/** Steward account (code storage plus room), Stake, and a little liquid NEAR on the Name. */
const STEWARD_NEAR = "1.65";
const STAKE_NEAR = "1";
const BUFFER_NEAR = "0.1";

export interface TestnetIds {
  root: string;
  registry: string;
  extension: string;
  namespace: string;
  recovery: string;
}

export function testnetIds(root: string): TestnetIds {
  const sub = Object.fromEntries(CONTRACTS.map((c) => [c.role, `${c.prefix}.${root}`]));
  return { root, registry: sub.registry, extension: sub.extension, namespace: sub.namespace, recovery: sub.recovery };
}

/** NEAR the root account needs: contract accounts, the Steward, the Stake, Rent and gas. */
export function testnetCostYocto(): bigint {
  const contracts = CONTRACTS.reduce((sum, c) => sum + nearToYocto(c.near), 0n);
  return contracts + nearToYocto(STEWARD_NEAR) + nearToYocto(STAKE_NEAR) + nearToYocto(BUFFER_NEAR) + nearToYocto("0.5");
}

/** The private key for `root`: EVERGREEN_KEY_FILE, else near-cli's ~/.near-credentials/testnet/<root>.json. */
export function testnetKey(root: string): KeyPairString {
  const file = process.env.EVERGREEN_KEY_FILE ?? join(homedir(), ".near-credentials", "testnet", `${root}.json`);
  if (!existsSync(file)) {
    throw new Error(`No key for ${root}. Put near-cli's ${root}.json at ${file}, or set EVERGREEN_KEY_FILE.`);
  }
  const json = JSON.parse(readFileSync(file, "utf8"));
  const key = json.private_key ?? json.secret_key;
  if (typeof key !== "string" || !key.startsWith("ed25519:")) throw new Error(`${file} has no ed25519 private_key`);
  return key as KeyPairString;
}

export interface TestnetState {
  network: "testnet";
  rpcUrl: string;
  root: string;
  registryId: string;
  namespace: string;
  poolId: string;
  termSecs: number;
  /** Name -> Steward account. */
  stewards: Record<string, string>;
  /** Steps that already ran, so a failed deploy resumes where it stopped. */
  done: string[];
}

export interface DeployOptions {
  root: string;
  /** Signs for the root and every contract sub-account (they all get the root's key). */
  key: KeyPairString;
  statePath: string;
  rpcUrl?: string;
  /** Account whose published global contract every wallet runs. */
  walletCode?: string;
  pool?: string;
  /** The Name to make Evergreen, as a label under the Namespace. */
  label?: string;
  log?: (line: string) => void;
}

export async function deployTestnet(options: DeployOptions): Promise<{ state: TestnetState; client: Evergreen }> {
  const { root, key, statePath } = options;
  const log = options.log ?? console.log;
  const rpcUrl = options.rpcUrl ?? TESTNET_RPC;
  const pool = options.pool ?? TESTNET_POOL;
  const ids = testnetIds(root);
  const client = new Evergreen({ rpcUrl, registryId: ids.registry });
  const account = (id: string): Account => client.account(id, key);
  const rootAccount = account(root);

  const saved: TestnetState | undefined = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : undefined;
  if (saved && (saved.root !== root || saved.registryId !== ids.registry)) {
    throw new Error(`${statePath} belongs to another deploy (${saved.registryId}). Move it away to start over.`);
  }
  const state: TestnetState = saved ?? {
    network: "testnet",
    rpcUrl,
    root,
    registryId: ids.registry,
    namespace: ids.namespace,
    poolId: pool,
    termSecs: 365 * DAY,
    stewards: {},
    done: [],
  };
  const save = () => writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const step = async (name: string, run: () => Promise<void>) => {
    if (state.done.includes(name)) return;
    log(`  ${name}...`);
    await run();
    state.done.push(name);
    save();
  };

  if (state.done.length === 0) {
    const need = testnetCostYocto();
    const have = (await rootAccount.getState()).balance.available;
    log(`${root} has ${yoctoToNear(have, 2)} NEAR; this deploy needs about ${yoctoToNear(need, 2)}.`);
    if (have < need) throw new Error(`Not enough testnet NEAR on ${root}. Top it up and run again. Nothing was spent.`);
  }

  const publicKey = KeyPair.fromString(key).getPublicKey().toString();
  for (const c of CONTRACTS) {
    await step(`account ${c.prefix}.${root}`, async () => {
      const exists = await account(`${c.prefix}.${root}`)
        .getState()
        .then(() => true)
        .catch(() => false);
      if (!exists) await rootAccount.createSubAccount({ accountOrPrefix: c.prefix, publicKey, nearToTransfer: nearToYocto(c.near) });
    });
  }

  await step("registry", async () => {
    await account(ids.registry).deployContract(old("tla_registry"));
    await call(account(ids.registry), ids.registry, "new", {
      admin: root,
      hos_extension: ids.extension,
      grace_period_ns: (BigInt(DAY) * NS).toString(),
      treasury: root,
      council: root,
    });
  });
  await step("extension", async () => {
    await account(ids.extension).deployContract(old("hos_extension"));
    await call(account(ids.extension), ids.extension, "new", {
      admin: root,
      registry: ids.registry,
      recovery: ids.recovery,
      treasury: root,
      council: root,
    });
  });
  await step("recovery", async () => {
    await account(ids.recovery).deployContract(old("mpc_recovery"));
    await call(account(ids.recovery), ids.recovery, "new", {
      owner: root,
      signer: root,
      transfer_authority: ids.extension,
      watchers: [
        "ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847",
        "ed25519:5BGSaf6YjVm7565VzWQHNxoyEjwr3jUpRJSGjREvU9dB",
      ],
      threshold: 2,
    });
  });
  await step("registrar", async () => {
    await account(ids.namespace).deployContract(old("registrar"));
    await call(account(ids.namespace), ids.namespace, "new", {
      config: {
        registry: ids.registry,
        council: root,
        wallet_impl: options.walletCode ?? HOS_WALLET_CODE,
        hos_extension: ids.extension,
        recovery: ids.recovery,
        chain_id: "testnet",
        min_balance: nearToYocto("0.01").toString(),
        min_label_len: 1,
        wallet_timeout_secs: 3600,
      },
    });
  });
  await step("rate", async () => {
    const rate = await liveNearUsdMicro();
    await call(rootAccount, ids.registry, "admin_set_initial_rate", { rate: String(rate) });
  });
  await step("fees", async () => {
    const fee: any = await client.rpc.callFunction({ contractId: ids.registry, method: "get_fee_config", args: {} });
    for (const tier of ["rent_tier_5_usd_micro", "rent_tier_8_usd_micro", "rent_tier_10_usd_micro", "rent_tier_12plus_usd_micro"]) {
      fee[tier] = "10"; // $0.00001 a year: one epoch of real rewards on 1 NEAR covers it
    }
    fee.account_creation_deposit_yocto = nearToYocto("0.01").toString();
    await call(rootAccount, ids.registry, "update_fee_config", { config: fee }, { deposit: ONE_YOCTO });
  });
  await step("namespace", async () => {
    await call(
      rootAccount,
      ids.registry,
      "register_tla",
      { tla_id: ids.namespace, tla_type: "Open", premium_category: "Standard", licensee: null },
      { deposit: ONE_YOCTO },
    );
    await call(rootAccount, ids.registry, "activate_open_tla", { tla_id: ids.namespace });
  });

  // One Evergreen Name. Window longer than the Lease, so the Steward renews as soon as real rewards cover Rent.
  const name = `${options.label ?? "evergreen"}.${ids.namespace}`;
  await step(`rent ${name}`, async () => {
    await refreshRate(client, rootAccount, ids.registry);
    await client.rent(rootAccount, name);
  });
  await step(`adopt ${name}`, async () => {
    state.stewards[name] = await client.adopt(rootAccount, name, {
      pool,
      stakeYocto: nearToYocto(STAKE_NEAR),
      liquidBufferYocto: nearToYocto(BUFFER_NEAR),
      stewardBalanceYocto: nearToYocto(STEWARD_NEAR),
      stewardWasm: wasm("steward"),
      windowSecs: 400 * DAY,
      lapseGuardSecs: 3 * DAY,
    });
  });
  return { state, client };
}

/** NEAR/USD in micro-dollars from House of Stake's live mainnet registry, else $3. */
export async function liveNearUsdMicro(): Promise<number> {
  try {
    const res = await fetch("https://rpc.mainnet.fastnear.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "query",
        params: { request_type: "call_function", finality: "final", account_id: "registry.hos", method_name: "get_near_usd_rate", args_base64: "e30=" },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body: any = await res.json();
    return Number(JSON.parse(Buffer.from(body.result.result).toString()));
  } catch {
    return 3_000_000;
  }
}

/**
 * The registry refuses to price Rent with a rate older than 6 hours, and the root account is its
 * oracle. Re-posts the rate (moved toward mainnet's, within the registry's 20% step) when it is older than `maxAgeSecs`.
 */
export async function refreshRate(client: Evergreen, oracle: Account, registryId: string, maxAgeSecs = 3600): Promise<void> {
  const meta: any = await client.rpc.callFunction({ contractId: registryId, method: "get_rate_meta", args: {} });
  if ((await client.chainTimeNs()) - BigInt(meta.updated_at) < BigInt(maxAgeSecs) * NS) return;
  const current = Number(await client.rpc.callFunction({ contractId: registryId, method: "get_near_usd_rate", args: {} }));
  const target = await liveNearUsdMicro();
  const rate = Math.round(Math.min(current * 1.19, Math.max(current * 0.81, target)));
  await call(oracle, registryId, "set_near_usd_rate", { rate: String(rate) });
}
