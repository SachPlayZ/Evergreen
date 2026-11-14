/** Reads everything about one account's Names on testnet. Used by the /app page (browser) and /api/names (agents). */
import { Evergreen, stewardIdFor, view } from "@evergreen-names/client";
import { NET } from "./testnet";

export interface NameView {
  name: string;
  owner: string;
  status: string;
  secondsLeft: number;
  expiresAtMs: number;
  /** Plain NEAR sitting on the Name account. */
  balanceYocto: string;
  /** Your Steward for this Name (exists after "Make it Evergreen", even after you take the Name back). */
  stewardId: string;
  evergreen: boolean;
  steward?: {
    phase: string;
    phaseDetail: unknown;
    patron: string;
    principalYocto: string;
    stakedYocto: string;
    rewardsYocto: string;
    needYocto: string;
    renewals: number;
    tipCount: number;
    /** "current": the published global Steward code. "legacy": an early Steward whose exit leaves the Name's plain NEAR on the Steward. */
    code: "current" | "legacy";
  };
  /** The Name's own position in the pool: what a Steward staked for it, still there after you take it back. */
  pool?: { id: string; stakedYocto: string; unstakedYocto: string; available: boolean };
}

export const client = () => new Evergreen({ rpcUrl: NET.rpcUrl, registryId: NET.registryId });

export async function priceOf(name: string) {
  const p = await client().getPrice(name);
  return { rentYocto: p.rentYocto.toString(), totalYocto: p.totalToRentYocto.toString(), rentUsd: p.rentUsd, nearUsd: p.nearUsd };
}

export async function balanceOf(accountId: string): Promise<string> {
  try {
    return (await client().rpc.viewAccount({ accountId })).amount.toString();
  } catch {
    return "0";
  }
}

/** The global contract a Steward runs, if any (undefined for an account with its own wasm). */
/**
 * Where `owner`'s Steward for `name` can live: made by the factory (the app), or a sub-account of `owner`
 * (CLI, agents, early app). Factory first.
 */
export const stewardIdsFor = (name: string, owner: string) => [stewardIdFor(name, owner, NET.stewardCode), stewardIdFor(name, owner)];

/** "current" if the Steward runs today's global Steward code. */
async function stewardCodeOf(accountId: string): Promise<"current" | "legacy"> {
  const res = await fetch(NET.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "final", account_id: accountId } }),
  });
  const a = (await res.json()).result;
  return a?.global_contract_account_id === NET.stewardCode ? "current" : "legacy";
}

/** Every Name in the namespace that `owner` holds, directly or through its own Steward. */
export async function namesOf(owner: string): Promise<NameView[]> {
  const c = client();
  const leases = (await c.listNames(NET.namespace, 500)).filter((l) => l.owner === owner || stewardIdsFor(l.name, owner).includes(l.owner));
  return Promise.all(
    leases.map(async (l): Promise<NameView> => {
      // The Steward that owns it now, else one it had before (exited), else the one Make it Evergreen creates.
      const ids = stewardIdsFor(l.name, owner);
      const found = ids.includes(l.owner)
        ? { id: l.owner, s: await c.getSteward(l.owner).catch(() => undefined) }
        : (await Promise.all(ids.map(async (id) => ({ id, s: await c.getSteward(id).catch(() => undefined) })))).find((x) => x.s?.name === l.name);
      const stewardId = found?.id ?? ids[0];
      const s = found?.s;
      const evergreen = l.owner === stewardId;
      const balanceYocto = await balanceOf(l.name);
      const view_: NameView = {
        name: l.name,
        owner: l.owner,
        status: l.status,
        secondsLeft: l.secondsLeft,
        expiresAtMs: Number(l.expiresAtNs / 1_000_000n),
        balanceYocto,
        stewardId,
        evergreen,
      };
      if (s && evergreen) {
        const phase = typeof s.phase === "string" ? s.phase : Object.keys(s.phase)[0];
        view_.steward = {
          phase,
          phaseDetail: s.phase,
          patron: s.patron,
          principalYocto: s.principalYocto.toString(),
          stakedYocto: s.stakedYocto.toString(),
          rewardsYocto: s.rewardsYocto.toString(),
          needYocto: s.needYocto.toString(),
          renewals: s.renewals.length,
          tipCount: s.tipCount,
          code: await stewardCodeOf(stewardId),
        };
      }
      if (s) {
        const [staked, unstaked, available] = await Promise.all([
          view<string>(c.rpc, s.pool, "get_account_staked_balance", { account_id: l.name }),
          view<string>(c.rpc, s.pool, "get_account_unstaked_balance", { account_id: l.name }),
          view<boolean>(c.rpc, s.pool, "is_account_unstaked_balance_available", { account_id: l.name }),
        ]);
        view_.pool = { id: s.pool, stakedYocto: staked, unstakedYocto: unstaked, available };
      }
      return view_;
    }),
  );
}
