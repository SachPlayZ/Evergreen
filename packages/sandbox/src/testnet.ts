/**
 * Deploys the same stack as the sandbox to NEAR testnet, under one funded account.
 * Contracts get sub-accounts of it; every role that is just a signer (council, relay,
 * the people in the story) is the account itself, so Rent and rewards circulate back to it.
 *
 * DEMO SETTINGS, as on the sandbox: 60s Leases and Grace, the demo pool, and Rent tiers
 * scaled down so each Lease costs about 0.03 testnet NEAR.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { KeyPair, type KeyPairString } from "near-api-js";
import { Evergreen, nearToYocto, yoctoToNear } from "@evergreen-names/client";
import { deployStack, wasm, walletCodeDepositYocto, type StackIds } from "./index";

export const TESTNET_RPC = "https://test.rpc.fastnear.com";
export const TESTNET_LEASE_SECS = 60;
export const TESTNET_RENT_SCALE = 0.002;

/** Contract accounts, as sub-account prefixes, and the NEAR each starts with (storage plus room). */
const CONTRACTS: { role: "registry" | "extension" | "recovery" | "walletImpl" | "namespace" | "pool"; prefix: string; near: string }[] = [
  { role: "registry", prefix: "registry", near: "8.5" },
  { role: "extension", prefix: "ext", near: "3.6" },
  { role: "recovery", prefix: "rec", near: "3.4" },
  { role: "walletImpl", prefix: "wimpl", near: "2.4" },
  { role: "namespace", prefix: "demo", near: "2.6" },
  { role: "pool", prefix: "pool", near: "1.8" },
];
/** The story: Steward balance, Stake, a Tip, and two Leases with their account deposits. */
const STORY_NEAR = "7";

export function testnetIds(root: string): StackIds {
  const sub = Object.fromEntries(CONTRACTS.map((c) => [c.role, `${c.prefix}.${root}`]));
  return {
    council: root,
    patch: root,
    relay: root,
    registry: sub.registry,
    extension: sub.extension,
    recovery: sub.recovery,
    walletImpl: sub.walletImpl,
    namespace: sub.namespace,
    pool: sub.pool,
  };
}

/** NEAR the root account needs for a full deploy, story included. */
export function testnetCostYocto(): bigint {
  const accounts = CONTRACTS.reduce((sum, c) => sum + nearToYocto(c.near), 0n);
  return accounts + walletCodeDepositYocto() + nearToYocto(STORY_NEAR) + nearToYocto(1);
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

export async function deployTestnet(options: {
  root: string;
  statePath: string;
  rpcUrl?: string;
  log?: (line: string) => void;
}): Promise<{ state: TestnetState; client: Evergreen }> {
  const { root, statePath } = options;
  const log = options.log ?? console.log;
  const rpcUrl = options.rpcUrl ?? TESTNET_RPC;
  const key = testnetKey(root);
  const ids = testnetIds(root);
  const client = new Evergreen({ rpcUrl, registryId: ids.registry });
  const account = (id: string) => client.account(id, key);
  const rootAccount = account(root);

  const saved: TestnetState | undefined = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : undefined;
  if (saved && saved.root !== root) throw new Error(`${statePath} belongs to ${saved.root}, not ${root}.`);
  const state: TestnetState = saved ?? {
    network: "testnet",
    rpcUrl,
    root,
    registryId: ids.registry,
    namespace: ids.namespace,
    poolId: ids.pool,
    termSecs: TESTNET_LEASE_SECS,
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
    log(`${root} has ${yoctoToNear(have, 2)} NEAR; a full deploy needs about ${yoctoToNear(need, 2)}.`);
    if (have < need) throw new Error(`Not enough testnet NEAR on ${root}. Top it up and run again.`);
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
  await deployStack({
    ids,
    client,
    account,
    leaseSecs: TESTNET_LEASE_SECS,
    graceSecs: TESTNET_LEASE_SECS,
    nearUsdMicro: 5_000_000,
    rentScale: TESTNET_RENT_SCALE,
    step,
  });

  // The live scene: alice is Evergreen, bob is left alone. The keeper re-rents bob when he lapses.
  const alice = `alice.${ids.namespace}`;
  const bob = `bob.${ids.namespace}`;
  await step(`rent ${alice}`, async () => void (await client.rent(rootAccount, alice)));
  await step(`rent ${bob}`, async () => void (await client.rent(rootAccount, bob)));
  await step(`adopt ${alice}`, async () => {
    state.stewards[alice] = await client.adopt(rootAccount, alice, {
      pool: ids.pool,
      stakeYocto: nearToYocto(2),
      stewardWasm: wasm("steward"),
      windowSecs: 35,
      lapseGuardSecs: 12,
    });
  });
  await step(`tip ${alice}`, async () => client.tip(rootAccount, state.stewards[alice], nearToYocto("0.2")));
  return { state, client };
}
