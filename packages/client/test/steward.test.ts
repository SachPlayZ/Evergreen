/** Evergreen Names: a Steward owns the Name and keeps it alive. Sandbox, 60-second Leases, DEMO pool. */
import { afterAll, beforeAll, expect, test } from "vitest";
import { startSandbox, type EvergreenSandbox } from "@evergreen-names/sandbox";
import { adoptTxs, nearToYocto, sendNftTx, sendTxs, stewardIdFor, unstakeAllTx, withdrawFromPoolTx, withdrawFromNameTx } from "../src/index";

let sb: EvergreenSandbox;
const NS = 1_000_000_000n;
const WINDOW = 35;
const GUARD = 15;

beforeAll(async () => {
  sb = await startSandbox({ people: ["ana", "fan", "keeper", "code"] });
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

test("a Name made Evergreen from the published Steward code can be taken back, Stake and all, into the Patron's hands", async () => {
  // The Steward's code is published once as a global contract; each new Steward just points at it.
  await sb.account("code").deployGlobalContract(sb.stewardWasm, "accountId");
  const ana = sb.account("ana");
  const name = "keeps.demo";
  await sb.client.rent(ana, name);
  const stake = nearToYocto(5);
  const stewardId = await sb.client.adopt(ana, name, {
    pool: sb.poolId,
    stakeYocto: stake,
    stewardCode: { globalAccountId: "code" },
    windowSecs: WINDOW,
    lapseGuardSecs: GUARD,
  });
  let s = await sb.client.getSteward(stewardId);
  expect(s.lease.owner).toBe(stewardId);
  expect(s.stakedYocto).toBe(stake);

  // Taking it back: the Name and its plain NEAR return to the Patron. Before the fix, the transfer swept that NEAR
  // to the Steward (the Payout Account since adoption), which cannot send NEAR on.
  const stewardBefore = await sb.balanceOf(stewardId);
  const nameBefore = await sb.balanceOf(name);
  await sb.client.exit(ana, stewardId);
  expect((await sb.client.getLease(name))!.owner).toBe("ana");
  expect(await sb.balanceOf(stewardId)).toBeLessThan(stewardBefore + nearToYocto("0.01"));
  expect(await sb.balanceOf(name)).toBeGreaterThanOrEqual(nameBefore);

  // The Stake is still the Name's, in the pool. The owner unstakes, withdraws, and moves it home through the Name's wallet.
  await sendTxs(ana, [unstakeAllTx(name, sb.poolId)]);
  const unstaked = BigInt(await sb.client.rpc.callFunction({ contractId: sb.poolId, method: "get_account_unstaked_balance", args: { account_id: name } }) as string);
  expect(unstaked).toBeGreaterThanOrEqual(stake);
  await sendTxs(ana, [withdrawFromPoolTx(name, sb.poolId, unstaked)]);
  expect(await sb.balanceOf(name)).toBeGreaterThanOrEqual(stake);
  const anaMid = await sb.balanceOf("ana");
  await sendTxs(ana, [withdrawFromNameTx(name, "ana", stake)]);
  expect(await sb.balanceOf("ana")).toBeGreaterThan(anaMid + stake - nearToYocto("0.01"));

  // A Steward only accepts its own Name from its own Patron. Anyone else's NFT is handed straight back.
  const fan = sb.account("fan");
  await sb.client.rent(fan, "stray.demo");
  await sendTxs(fan, [sendNftTx(sb.registryId, "stray.demo", stewardId)]);
  expect((await sb.client.getLease("stray.demo"))!.owner).toBe("fan");

  // The Patron makes it Evergreen again just by sending the NFT back.
  await sendTxs(ana, [sendNftTx(sb.registryId, name, stewardId)]);
  s = await sb.client.getSteward(stewardId);
  expect(s.lease.owner).toBe(stewardId);
});

test("sending the NFT to its Steward is what makes it Evergreen: the Stake moves onto the Name and is staked", async () => {
  const ana = sb.account("ana");
  const name = "sent.demo";
  await sb.client.rent(ana, name);
  const stake = nearToYocto(4);
  const [create, send] = adoptTxs({
    registryId: sb.registryId,
    name,
    patron: "ana",
    pool: sb.poolId,
    stakeYocto: stake,
    windowSecs: WINDOW,
    lapseGuardSecs: GUARD,
    code: { globalAccountId: "code" },
  });
  const stewardId = stewardIdFor(name, "ana");
  await sendTxs(ana, [create]);
  // Before the NFT arrives the Steward holds the Stake and owns nothing.
  expect((await sb.client.getLease(name))!.owner).toBe("ana");
  expect(await sb.balanceOf(stewardId)).toBeGreaterThan(stake);

  // One NEP-171 transfer: nft_transfer_call → Steward.nft_on_transfer → the Name is funded and stakes.
  expect(send.receiverId).toBe(sb.registryId);
  await sendTxs(ana, [send]);
  const s = await sb.client.getSteward(stewardId);
  expect(s.lease.owner).toBe(stewardId);
  expect(s.stakedYocto).toBe(stake);
  expect(s.principalYocto).toBe(stake);
  expect(await sb.balanceOf(name)).toBeGreaterThanOrEqual(nearToYocto("0.5"));
  expect(await sb.balanceOf(stewardId)).toBeLessThan(nearToYocto("0.3"));
});
