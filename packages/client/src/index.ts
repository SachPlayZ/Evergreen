/**
 * Internal client for Evergreen. Shared by the CLI, the web app and the Keeper.
 * Talks to the unmodified Top Level Accounts registry (houseofstake/tla-contracts
 * @ d85860a), a staking pool and Steward contracts.
 */
import { Account, JsonRpcProvider, actions } from "near-api-js";
import { ONE_YOCTO, TGAS, call, nearToYocto, provider, view } from "./near";

export * from "./near";

export interface EvergreenConfig {
  rpcUrl: string;
  registryId: string;
}

/**
 * Mainnet registry, read from a live Namespace contract on 11 Nov 2026
 * (`account`.config() -> registry: "registry.hos").
 */
/** Mirrors BUFFER_BPS in contracts/steward: the Steward unstakes Rent plus 10%, in case the price moves. */
const STEWARD_BUFFER_BPS = 1_000n;

export const MAINNET: EvergreenConfig = {
  rpcUrl: "https://rpc.mainnet.near.org",
  registryId: "registry.hos",
};

export type LeaseStatus = "active" | "grace" | "reclaimable" | "suspended" | "not_rented";

export interface Lease {
  /** Full Name, e.g. `alice.demo`. */
  name: string;
  label: string;
  namespace: string;
  owner: string;
  payoutAccount: string;
  status: LeaseStatus;
  rentedAtNs: bigint;
  expiresAtNs: bigint;
  /** When Grace ends and the Name becomes Reclaimable. */
  graceEndsAtNs: bigint;
  /** Seconds until expiry on chain time. Negative once in Grace. */
  secondsLeft: number;
}

export interface Price {
  rentYocto: bigint;
  /** Rent plus the one-off account deposit charged when a Name is first rented. */
  totalToRentYocto: bigint;
  rentUsd: number;
  nearUsd: number;
}

export type WarningCode =
  | "NOT_RENTED"
  | "IN_GRACE"
  | "RECLAIMABLE"
  | "SUSPENDED"
  | "OWNER_CHANGED"
  | "RECENTLY_RENTED"
  | "EXPIRES_SOON";

export interface Warning {
  code: WarningCode;
  message: string;
}

export interface PayCheck {
  ok: boolean;
  warnings: Warning[];
  lease?: Lease;
}

export interface CheckOptions {
  /** The Owner you expect. A different Owner raises OWNER_CHANGED. */
  expectOwner?: string;
  /** Rented within this many seconds raises RECENTLY_RENTED. Default 7 days. */
  recentSecs?: number;
  /** Expiring within this many seconds raises EXPIRES_SOON. Default 30 days. */
  soonSecs?: number;
}

export type StewardPhase =
  | "Idle"
  | { Unstaking: { amount: string; purpose: "Renew" | "Evacuate" } }
  | { Withdrawing: { amount: string; until: string; purpose: "Renew" | "Evacuate" } }
  | { Renewing: { amount: string; prev_expires: string } }
  | { Evacuated: { amount: string } };

export interface StewardStatus {
  stewardId: string;
  name: string;
  patron: string;
  pool: string;
  principalYocto: bigint;
  tipsYocto: bigint;
  tipCount: number;
  windowNs: bigint;
  lapseGuardNs: bigint;
  phase: StewardPhase;
  renewals: { atNs: bigint; newExpiresNs: bigint; rentYocto: bigint }[];
  stakedYocto: bigint;
  /** Staked balance above principal: what can pay Rent. */
  rewardsYocto: bigint;
  /** Next Rent, in yoctoNEAR. */
  rentYocto: bigint;
  /** Rewards the Steward needs before it will renew: Rent plus its 10% price buffer. */
  needYocto: bigint;
  lease: Lease;
}

export interface AdoptOptions {
  pool: string;
  stakeYocto: bigint;
  stewardWasm: Uint8Array;
  /** Renewal starts this long before expiry. */
  windowSecs: number;
  /** If Rent is still uncovered this long before expiry, the Stake is pulled back to the Name. */
  lapseGuardSecs: number;
  /** Plain NEAR left on the Name so its wallet can act. Default 0.5 NEAR. */
  liquidBufferYocto?: bigint;
  /** NEAR given to the Steward account for storage. Default 3 NEAR. */
  stewardBalanceYocto?: bigint;
}

const DAY = 86_400;
const NS = 1_000_000_000n;

export function splitName(name: string): { label: string; namespace: string } {
  const dot = name.indexOf(".");
  if (dot <= 0) throw new Error(`"${name}" is not a Name like alice.demo`);
  return { label: name.slice(0, dot), namespace: name.slice(dot + 1) };
}

/** The Steward account for a Name: a keyless sub-account of its Patron. */
export function stewardIdFor(name: string, patronId: string): string {
  const { label, namespace } = splitName(name);
  return `ev-${label}-${namespace.replace(/\./g, "-")}.${patronId}`;
}

export class Evergreen {
  readonly rpc: JsonRpcProvider;
  readonly registryId: string;

  constructor(config: EvergreenConfig) {
    this.rpc = provider(config.rpcUrl);
    this.registryId = config.registryId;
  }

  /** An account that can sign, for the write methods below. */
  account(accountId: string, privateKey: string): Account {
    return new Account(accountId, this.rpc, privateKey as `ed25519:${string}`);
  }

  /** Chain time in nanoseconds. A sandbox's clock can run ahead of the wall clock. */
  async chainTimeNs(): Promise<bigint> {
    const block: any = await this.rpc.viewBlock({ finality: "optimistic" });
    return BigInt(block.header.timestamp_nanosec ?? block.header.timestamp);
  }

  // ---- Names and Leases ----

  async getPrice(name: string): Promise<Price> {
    const { label, namespace } = splitName(name);
    const [price, rate] = await Promise.all([
      view<{ rent_yocto: string; total_yocto: string }>(this.rpc, this.registryId, "get_rent_price", {
        tla_id: namespace,
        name: label,
      }),
      view<string>(this.rpc, this.registryId, "get_near_usd_rate"),
    ]);
    const rentYocto = BigInt(price.rent_yocto);
    const nearUsd = Number(rate) / 1e6;
    return {
      rentYocto,
      totalToRentYocto: BigInt(price.total_yocto),
      rentUsd: (Number(rentYocto / 10n ** 18n) / 1e6) * nearUsd,
      nearUsd,
    };
  }

  /** The Lease for a Name, or undefined if nobody rents it. */
  async getLease(name: string): Promise<Lease | undefined> {
    const { label, namespace } = splitName(name);
    const [sub, grace, now] = await Promise.all([
      view<RawSub | null>(this.rpc, this.registryId, "get_sub_account", { tla_id: namespace, name: label }),
      view<string>(this.rpc, this.registryId, "get_grace_period_ns"),
      this.chainTimeNs(),
    ]);
    return sub ? toLease(sub, BigInt(grace), now) : undefined;
  }

  async getLeaseStatus(name: string): Promise<LeaseStatus> {
    return (await this.getLease(name))?.status ?? "not_rented";
  }

  /** Every Lease under a Namespace. */
  async listNames(namespace: string, limit = 100): Promise<Lease[]> {
    const [rows, grace, now] = await Promise.all([
      view<{ sub_account: RawSub }[]>(this.rpc, this.registryId, "list_sub_accounts_by_tla", {
        tla_id: namespace,
        from_index: 0,
        limit,
      }),
      view<string>(this.rpc, this.registryId, "get_grace_period_ns"),
      this.chainTimeNs(),
    ]);
    return rows.map((r) => toLease(r.sub_account, BigInt(grace), now));
  }

  /** Names in Grace, or expiring within `soonSecs`: the ones that need a Lifeline. */
  async listAtRisk(namespace: string, soonSecs = 30 * DAY): Promise<Lease[]> {
    return (await this.listNames(namespace))
      .filter((l) => l.status === "grace" || (l.status === "active" && l.secondsLeft <= soonSecs))
      .sort((a, b) => a.secondsLeft - b.secondsLeft);
  }

  /** Every Lease in the registry, across all Namespaces. */
  async listAllNames(max = 500): Promise<Lease[]> {
    const [grace, now] = await Promise.all([
      view<string>(this.rpc, this.registryId, "get_grace_period_ns"),
      this.chainTimeNs(),
    ]);
    const out: Lease[] = [];
    for (let from = 0; from < max; from += 50) {
      const rows = await view<{ sub_account: RawSub }[]>(this.rpc, this.registryId, "list_sub_accounts", {
        from_index: from,
        limit: 50,
      });
      out.push(...rows.map((r) => toLease(r.sub_account, BigInt(grace), now)));
      if (rows.length < 50) break;
    }
    return out;
  }

  /** The Steward status if this Lease's Owner is a Steward for it, else undefined. */
  async stewardOf(lease: Lease): Promise<StewardStatus | undefined> {
    try {
      const status = await this.getSteward(lease.owner);
      return status.name === lease.name ? status : undefined;
    } catch {
      return undefined;
    }
  }

  async rent(signer: Account, name: string): Promise<Lease> {
    const { label, namespace } = splitName(name);
    const { totalToRentYocto } = await this.getPrice(name);
    await call(signer, this.registryId, "rent_sub_account", { tla_id: namespace, name: label }, {
      deposit: totalToRentYocto,
    });
    await this.waitForWallet(name);
    return (await this.getLease(name))!;
  }

  /**
   * Pays one term of Rent. Anyone may pay for any Name, so this is also the
   * direct Lifeline. Refused once Grace has ended.
   */
  async renew(signer: Account, name: string): Promise<Lease> {
    const { label, namespace } = splitName(name);
    const { rentYocto } = await this.getPrice(name);
    await call(signer, this.registryId, "renew_sub_account", { tla_id: namespace, name: label }, {
      deposit: rentYocto,
    });
    return (await this.getLease(name))!;
  }

  async pendingRefund(accountId: string): Promise<bigint> {
    return BigInt(await view<string>(this.rpc, this.registryId, "get_pending_refund", { account_id: accountId }));
  }

  /** Collects Rent the registry over-collected from this account. */
  async claimRefund(signer: Account): Promise<void> {
    await call(signer, this.registryId, "claim_refund", {});
  }

  /** Warnings to show before sending money to a Name. Never blocks a payment. */
  async checkBeforePaying(name: string, options: CheckOptions = {}): Promise<PayCheck> {
    const { expectOwner, recentSecs = 7 * DAY, soonSecs = 30 * DAY } = options;
    const lease = await this.getLease(name);
    if (!lease) {
      return { ok: false, warnings: [warn("NOT_RENTED", `${name} is not rented by anyone.`)] };
    }
    const warnings: Warning[] = [];
    if (lease.status === "grace") {
      warnings.push(warn("IN_GRACE", `${name} has expired and is in Grace. It can be lost if it is not renewed.`));
    }
    if (lease.status === "reclaimable") {
      warnings.push(warn("RECLAIMABLE", `${name} can be reclaimed now. Funds sent to it may go to someone else.`));
    }
    if (lease.status === "suspended") {
      warnings.push(warn("SUSPENDED", `${name} is suspended.`));
    }
    if (expectOwner && lease.owner !== expectOwner) {
      warnings.push(warn("OWNER_CHANGED", `${name} is owned by ${lease.owner}, not ${expectOwner}.`));
    }
    const now = await this.chainTimeNs();
    if (now - lease.rentedAtNs <= BigInt(recentSecs) * NS) {
      warnings.push(warn("RECENTLY_RENTED", `${name} was rented recently and may have changed hands.`));
    }
    if (lease.status === "active" && lease.secondsLeft <= soonSecs) {
      warnings.push(warn("EXPIRES_SOON", `${name} expires in ${lease.secondsLeft} seconds.`));
    }
    return { ok: warnings.length === 0, warnings, lease };
  }

  // ---- Evergreen Names ----

  /**
   * Makes a Name Evergreen. The Patron (the current Owner) signs four steps:
   * create the Steward, hand it the Name, fund the Name, stake.
   * The Name is funded only after the hand-over, because a transfer sweeps its NEAR.
   */
  async adopt(patron: Account, name: string, options: AdoptOptions): Promise<string> {
    const { label, namespace } = splitName(name);
    const stewardId = stewardIdFor(name, patron.accountId);
    const buffer = options.liquidBufferYocto ?? nearToYocto("0.5");

    await patron.signAndSendTransaction({
      receiverId: stewardId,
      waitUntil: "FINAL",
      actions: [
        actions.createAccount(),
        actions.transfer(options.stewardBalanceYocto ?? nearToYocto(3)),
        actions.deployContract(options.stewardWasm),
        actions.functionCall(
          "new",
          {
            registry: this.registryId,
            tla_id: namespace,
            label,
            pool: options.pool,
            patron: patron.accountId,
            window_ns: (BigInt(options.windowSecs) * NS).toString(),
            lapse_guard_ns: (BigInt(options.lapseGuardSecs) * NS).toString(),
          },
          30n * TGAS,
          0n,
        ),
      ],
    });
    await call(
      patron,
      this.registryId,
      "transfer_sub_account",
      { tla_id: namespace, name: label, new_owner: stewardId },
      { deposit: ONE_YOCTO },
    );
    await patron.transfer({ receiverId: name, amount: options.stakeYocto + buffer });
    await call(patron, stewardId, "stake", { amount: options.stakeYocto.toString() });
    return stewardId;
  }

  /** Anyone can poke a Steward. Returns the step it took, e.g. `not_due`, `unstaking`, `renewed`. */
  async poke(signer: Account, stewardId: string): Promise<string> {
    return call<string>(signer, stewardId, "poke", {});
  }

  /** Lifeline: adds NEAR to an Evergreen Name's Stake. */
  async tip(signer: Account, stewardId: string, amountYocto: bigint): Promise<void> {
    await call(signer, stewardId, "tip", {}, { deposit: amountYocto });
  }

  /** The Patron takes the Name back. Its Stake stays with the Name. */
  async exit(patron: Account, stewardId: string): Promise<void> {
    await call(patron, stewardId, "exit", {});
  }

  async getSteward(stewardId: string): Promise<StewardStatus> {
    const raw = await view<RawSteward>(this.rpc, stewardId, "get_status");
    const [staked, lease, price] = await Promise.all([
      view<string>(this.rpc, raw.pool, "get_account_staked_balance", { account_id: raw.name }),
      this.getLease(raw.name),
      this.getPrice(raw.name),
    ]);
    if (!lease) throw new Error(`${raw.name} is no longer rented`);
    const principal = BigInt(raw.principal);
    const stakedYocto = BigInt(staked);
    return {
      stewardId,
      name: raw.name,
      patron: raw.patron,
      pool: raw.pool,
      principalYocto: principal,
      tipsYocto: BigInt(raw.tips),
      tipCount: raw.tip_count,
      windowNs: BigInt(raw.window_ns),
      lapseGuardNs: BigInt(raw.lapse_guard_ns),
      phase: raw.phase,
      renewals: raw.renewals.map((r) => ({
        atNs: BigInt(r.at_ns),
        newExpiresNs: BigInt(r.new_expires_ns),
        rentYocto: BigInt(r.rent_yocto),
      })),
      stakedYocto,
      rewardsYocto: stakedYocto > principal ? stakedYocto - principal : 0n,
      rentYocto: price.rentYocto,
      needYocto: price.rentYocto + (price.rentYocto * STEWARD_BUFFER_BPS) / 10_000n,
      lease,
    };
  }

  /** A freshly rented Name answers wallet views a moment after the rent lands. */
  private async waitForWallet(name: string): Promise<void> {
    for (let i = 0; i < 20; i++) {
      try {
        const extensions = await view<string[]>(this.rpc, name, "w_extensions");
        if (extensions.length > 0) return;
      } catch {
        // not deployed yet
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`${name} never became a working wallet`);
  }
}

/** Stake needed for staking rewards to cover Rent every year. */
export function stakeNeededYocto(rentYocto: bigint, apyPercent: number): bigint {
  return (rentYocto * 10_000n) / BigInt(Math.round(apyPercent * 100));
}

interface RawSub {
  full_name: string;
  owner: string;
  tla_id: string;
  payout_account: string;
  lifecycle: "Registered" | "Active" | "Grace" | "Reclaimable" | "Suspended";
  rented_at: string;
  expires_at: string;
}

interface RawSteward {
  name: string;
  patron: string;
  pool: string;
  principal: string;
  tips: string;
  tip_count: number;
  window_ns: string;
  lapse_guard_ns: string;
  phase: StewardPhase;
  renewals: { at_ns: string; new_expires_ns: string; rent_yocto: string }[];
}

function toLease(sub: RawSub, graceNs: bigint, nowNs: bigint): Lease {
  const { label, namespace } = splitName(sub.full_name);
  const expiresAtNs = BigInt(sub.expires_at);
  const graceEndsAtNs = expiresAtNs + graceNs;
  // Derived from chain time, so it is right even between registry state updates.
  const status: LeaseStatus =
    sub.lifecycle === "Suspended"
      ? "suspended"
      : nowNs < expiresAtNs
        ? "active"
        : nowNs < graceEndsAtNs
          ? "grace"
          : "reclaimable";
  return {
    name: sub.full_name,
    label,
    namespace,
    owner: sub.owner,
    payoutAccount: sub.payout_account,
    status,
    rentedAtNs: BigInt(sub.rented_at),
    expiresAtNs,
    graceEndsAtNs,
    secondsLeft: Number((expiresAtNs - nowNs) / NS),
  };
}

function warn(code: WarningCode, message: string): Warning {
  return { code, message };
}

/** JSON-safe copy of any client result: bigints become strings. */
export function toJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
