/** Names and Leases, through the client, against the real registry in a sandbox. */
import { afterAll, beforeAll, expect, test } from "vitest";
import { startSandbox, type EvergreenSandbox } from "@evergreen-names/sandbox";
import { nearToYocto } from "../src/index";

let sb: EvergreenSandbox;
const codes = async (name: string, options = {}) =>
  (await sb.client.checkBeforePaying(name, options)).warnings.map((w) => w.code);

beforeAll(async () => {
  sb = await startSandbox({ people: ["ana", "ben"] });
});
afterAll(async () => sb?.stop());

test("a Name is priced in dollars and NEAR, then rented", async () => {
  const price = await sb.client.getPrice("alice.demo");
  // 5 characters = $50 a year, x1.5 in an Open Standard Namespace, plus the registry's quote margin.
  expect(price.rentUsd).toBeGreaterThanOrEqual(75);
  expect(price.rentUsd).toBeLessThan(80);
  expect(price.nearUsd).toBe(5);

  expect(await sb.client.getLeaseStatus("alice.demo")).toBe("not_rented");
  const lease = await sb.client.rent(sb.account("ana"), "alice.demo");
  expect(lease.owner).toBe("ana");
  expect(lease.status).toBe("active");
  expect(lease.secondsLeft).toBeGreaterThan(40);
});

test("anyone can pay a Name's Rent, and overpaid Rent can be claimed back", async () => {
  const before = (await sb.client.getLease("alice.demo"))!;
  const after = await sb.client.renew(sb.account("ben"), "alice.demo");
  expect(after.expiresAtNs - before.expiresAtNs).toBe(BigInt(sb.leaseSecs) * 1_000_000_000n);
  expect(after.owner).toBe("ana");

  expect(await sb.client.pendingRefund("ben")).toBeGreaterThan(0n);
  await sb.client.claimRefund(sb.account("ben"));
  expect(await sb.client.pendingRefund("ben")).toBe(0n);
});

test("checkBeforePaying warns with codes and never blocks", async () => {
  expect(await codes("nobody.demo")).toEqual(["NOT_RENTED"]);
  expect(await codes("alice.demo", { recentSecs: 0, soonSecs: 0 })).toEqual([]);
  expect((await sb.client.checkBeforePaying("alice.demo", { recentSecs: 0, soonSecs: 0 })).ok).toBe(true);
  // With real-world defaults a minutes-old, minutes-long Lease is both recent and expiring soon.
  expect(await codes("alice.demo")).toEqual(["RECENTLY_RENTED", "EXPIRES_SOON"]);
  expect(await codes("alice.demo", { expectOwner: "ben", recentSecs: 0, soonSecs: 0 })).toEqual(["OWNER_CHANGED"]);
});

test("a staked Name that lapses hands its stake to the next renter", async () => {
  const ana = sb.account("ana");
  const ben = sb.account("ben");
  const name = "lapser.demo";
  const lease = await sb.client.rent(ana, name);
  await ana.transfer({ receiverId: name, amount: nearToYocto(6) });
  const stake = nearToYocto(5);
  await sb.walletCall(ana, name, sb.poolId, "deposit_and_stake", {}, stake);

  await sb.advance(sb.leaseSecs + 2);
  expect(await sb.client.getLeaseStatus(name)).toBe("grace");
  expect(await codes(name, { recentSecs: 0 })).toEqual(["IN_GRACE"]);

  await sb.advance(sb.graceSecs + 2);
  expect(await sb.client.getLeaseStatus(name)).toBe("reclaimable");
  expect(await codes(name, { recentSecs: 0 })).toEqual(["RECLAIMABLE"]);
  await expect(sb.client.renew(ben, name)).rejects.toMatchObject({ reason: "sub_account_past_grace_period" });

  // Anyone reclaims it; ben rents it next.
  await sb.reclaim(name);
  const next = await sb.client.rent(ben, name);
  expect(next.owner).toBe("ben");
  expect(next.rentedAtNs).toBeGreaterThan(lease.rentedAtNs);
  expect(await codes(name, { expectOwner: "ana", soonSecs: 0 })).toEqual(["OWNER_CHANGED", "RECENTLY_RENTED"]);

  // The reclaim swept only the Name's own NEAR. ana's 5 NEAR is still staked under the Name,
  // and ben, the new Owner, can take it.
  await ben.transfer({ receiverId: name, amount: nearToYocto(1) });
  const before = await sb.balanceOf(name);
  await sb.walletCall(ben, name, sb.poolId, "unstake", { amount: stake.toString() });
  await sb.walletCall(ben, name, sb.poolId, "withdraw", { amount: stake.toString() });
  expect((await sb.balanceOf(name)) - before).toBeGreaterThanOrEqual(stake);
});
