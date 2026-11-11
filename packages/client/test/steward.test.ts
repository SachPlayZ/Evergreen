/** Evergreen Names: a Steward owns the Name and keeps it alive. Sandbox, 60-second Leases, DEMO pool. */
import { afterAll, beforeAll, expect, test } from "vitest";
import { startSandbox, type EvergreenSandbox } from "@evergreen-names/sandbox";
import { nearToYocto } from "../src/index";

let sb: EvergreenSandbox;
const NS = 1_000_000_000n;
const WINDOW = 35;
const GUARD = 15;

beforeAll(async () => {
  sb = await startSandbox({ people: ["ana", "fan", "keeper"] });
});
afterAll(async () => sb?.stop());

async function adopt(name: string, stake: bigint) {
  const ana = sb.account("ana");
  await sb.client.rent(ana, name);
  return sb.client.adopt(ana, name, {
    pool: sb.poolId,
    stakeYocto: stake,
    stewardWasm: sb.stewardWasm,
    windowSecs: WINDOW,
    lapseGuardSecs: GUARD,
  });
}

/** Pokes until the Steward reports `want`, collecting each step. */
async function pokeUntil(stewardId: string, want: string, max = 8): Promise<string[]> {
  const steps: string[] = [];
  for (let i = 0; i < max; i++) {
    const step = await sb.client.poke(sb.account("keeper"), stewardId);
    steps.push(step);
    if (step === want) break;
  }
  return steps;
}

test("an Evergreen Name pays its own Rent from staking rewards, and never from principal", async () => {
  const name = "evergreen.demo";
  const stake = nearToYocto(30);
  const stewardId = await adopt(name, stake);

  // The Steward now owns the Name; the Patron's NEAR is staked from the Name itself.
  let s = await sb.client.getSteward(stewardId);
  expect(s.lease.owner).toBe(stewardId);
  expect(s.patron).toBe("ana");
  expect(s.stakedYocto).toBe(stake);

  // Too early: nothing to do.
  expect(await sb.client.poke(sb.account("keeper"), stewardId)).toBe("not_due");

  // A stranger's Tip joins the Stake as principal.
  await sb.client.tip(sb.account("fan"), stewardId, nearToYocto(2));
  s = await sb.client.getSteward(stewardId);
  expect(s.tipCount).toBe(1);
  const principal = s.principalYocto;
  expect(s.stakedYocto).toBe(principal);
  expect(principal).toBe(stake + nearToYocto(2) - 1n);

  // Inside the renewal window, but no rewards yet: the Steward will not touch principal.
  const expires = s.lease.expiresAtNs;
  await sb.waitUntil(expires - BigInt(WINDOW - 2) * NS);
  expect(await sb.client.poke(sb.account("keeper"), stewardId)).toMatch(/^insufficient_rewards/);

  // DEMO ONLY: the pool pays rewards on demand.
  await sb.dripReward(name, nearToYocto(5));
  const steps = await pokeUntil(stewardId, "renewed");
  expect(steps).toEqual(["unstaking", "withdrawing", "renewing", "renewed"]);

  s = await sb.client.getSteward(stewardId);
  expect(s.lease.expiresAtNs).toBe(expires + BigInt(sb.leaseSecs) * NS);
  expect(s.lease.status).toBe("active");
  expect(s.stakedYocto).toBeGreaterThanOrEqual(principal);
  expect(s.principalYocto).toBe(principal);
  expect(s.renewals).toHaveLength(1);
  expect(s.phase).toBe("Idle");

  // Overpaid Rent is claimed back onto the Name by the next poke.
  await sb.client.poke(sb.account("keeper"), stewardId);
  expect(await sb.client.pendingRefund(name)).toBe(0n);
});

test("if Rent cannot be covered, the Stake is pulled out of the pool before expiry; a Lifeline revives it", async () => {
  const name = "fragile.demo";
  const stake = nearToYocto(5);
  const stewardId = await adopt(name, stake);
  const before = await sb.client.getSteward(stewardId);

  // No rewards ever arrive. At the lapse guard the Steward evacuates the whole Stake,
  // so a reclaim would sweep it to the Payout Account instead of leaving it for the next renter.
  await sb.waitUntil(before.lease.expiresAtNs - BigInt(GUARD - 1) * NS);
  const steps = await pokeUntil(stewardId, "evacuated");
  expect(steps).toEqual(["evacuating", "withdrawing", "evacuated"]);
  let s = await sb.client.getSteward(stewardId);
  expect(s.stakedYocto).toBe(0n);
  expect(await sb.balanceOf(name)).toBeGreaterThanOrEqual(stake);
  expect(s.lease.status).toBe("active");

  // A supporter pays the Rent directly. The Steward puts the Stake back to work.
  await sb.client.renew(sb.account("fan"), name);
  expect(await sb.client.poke(sb.account("keeper"), stewardId)).toBe("restaked");
  s = await sb.client.getSteward(stewardId);
  expect(s.stakedYocto).toBe(stake);
  expect(s.lease.expiresAtNs).toBeGreaterThan(before.lease.expiresAtNs);

  // The Patron can always take the Name back.
  await sb.client.exit(sb.account("ana"), stewardId);
  expect((await sb.client.getLease(name))!.owner).toBe("ana");
});
