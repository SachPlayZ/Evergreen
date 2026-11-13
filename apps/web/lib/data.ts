import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Evergreen, MAINNET, toJson, type Lease } from "@evergreen-names/client";

export interface DemoConfig {
  rpcUrl: string;
  registryId: string;
  namespace: string;
  /** Lease length on this network, for drawing how much of a term is left. */
  termSecs: number;
  label: string;
}

/** The demo network: env vars when hosted, else the local sandbox started by `pnpm evergreen sandbox`. */
export function demoConfig(): DemoConfig | undefined {
  const env = process.env;
  if (env.EVERGREEN_RPC_URL && env.EVERGREEN_REGISTRY_ID && env.EVERGREEN_NAMESPACE) {
    return {
      rpcUrl: env.EVERGREEN_RPC_URL,
      registryId: env.EVERGREEN_REGISTRY_ID,
      namespace: env.EVERGREEN_NAMESPACE,
      termSecs: Number(env.EVERGREEN_TERM_SECS ?? 60),
      label: env.EVERGREEN_NETWORK_LABEL ?? "testnet copy",
    };
  }
  for (const file of [join(process.cwd(), "../../.evergreen/sandbox.json"), join(process.cwd(), ".evergreen/sandbox.json")]) {
    if (existsSync(/*turbopackIgnore: true*/ file)) {
      const sandbox = JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8"));
      return { ...sandbox, termSecs: 60, label: "local sandbox" };
    }
  }
  return undefined;
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function demoSnapshot() {
  const config = demoConfig();
  if (!config) return { configured: false as const };
  try {
    const client = new Evergreen(config);
    const leases = await client.listNames(config.namespace);
    const names = await Promise.all(
      leases.map(async (lease) => ({
        lease,
        steward: await client.stewardOf(lease),
        warnings: (await client.checkBeforePaying(lease.name, { recentSecs: 0, soonSecs: Math.round(config.termSecs / 3) }))
          .warnings,
      })),
    );
    return toJson({ configured: true as const, label: config.label, termSecs: config.termSecs, names });
  } catch (error) {
    return { configured: false as const, error: errorText(error) };
  }
}

/** The real Evergreen Name on testnet (addresses from deploy/testnet.json). Real pool, one-year Lease. */
export const TESTNET = {
  rpcUrl: "https://test.rpc.fastnear.com",
  registryId: "registry.sachindraz.testnet",
  name: "evergreen.ev.sachindraz.testnet",
  stewardId: "ev-evergreen-ev-sachindraz-testnet.sachindraz.testnet",
};

export async function testnetSnapshot() {
  try {
    const client = new Evergreen({ rpcUrl: TESTNET.rpcUrl, registryId: TESTNET.registryId });
    const s = await client.getSteward(TESTNET.stewardId);
    return toJson({
      name: TESTNET.name,
      stewardId: TESTNET.stewardId,
      pool: s.pool,
      phase: s.phase,
      stakedYocto: s.stakedYocto,
      principalYocto: s.principalYocto,
      rewardsYocto: s.rewardsYocto,
      needYocto: s.needYocto,
      renewals: s.renewals.length,
      secondsLeft: s.lease.secondsLeft,
      status: s.lease.status,
    });
  } catch (error) {
    return { error: errorText(error) };
  }
}

export async function mainnetSnapshot() {
  const client = new Evergreen(MAINNET);
  const [stats, rate, leases] = await Promise.all([
    client.rpc.callFunction({ contractId: MAINNET.registryId, method: "get_stats", args: {} }) as Promise<{
      tla_count: number;
      sub_account_count: number;
    }>,
    client.rpc.callFunction({ contractId: MAINNET.registryId, method: "get_near_usd_rate", args: {} }) as Promise<string>,
    client.listAllNames(),
  ]);
  const slim = (l: Lease) => ({
    name: l.name,
    owner: l.owner,
    status: l.status,
    secondsLeft: l.secondsLeft,
    expiresAtMs: Number(l.expiresAtNs / 1_000_000n),
  });
  return {
    registryId: MAINNET.registryId,
    namespaces: stats.tla_count,
    nameCount: stats.sub_account_count,
    nearUsd: Number(rate) / 1e6,
    names: leases.map(slim).sort((a, b) => a.secondsLeft - b.secondsLeft),
  };
}
