/**
 * `evergreen demo`: the whole story against a fresh local sandbox.
 * Every claim printed here is checked; the process exits non-zero if one fails.
 */
import { nearToYocto, stakeNeededYocto, yoctoToNear } from "@evergreen-names/client";
import { startSandbox } from "@evergreen-names/sandbox";

const NS = 1_000_000_000n;
const WINDOW = 35;
const GUARD = 12;
const REAL_APY = 5;

const step = (n: number, title: string) => console.log(`\n== ${n}. ${title}`);
const say = (line: string) => console.log(`   ${line}`);
const near = (y: bigint) => `${yoctoToNear(y, 3)} NEAR`;

function check(ok: boolean, claim: string): void {
  console.log(`   ${ok ? "PASS" : "FAIL"}  ${claim}`);
  if (!ok) throw new Error(`demo check failed: ${claim}`);
}

export async function runDemo(): Promise<void> {
  console.log("Evergreen demo: a NEAR Name that keeps itself alive.");
  console.log("DEMO SETTINGS (not real-world): Leases and Grace last 60 seconds, not 1 year / 14 days.");
  console.log("The DEMO pool pays rewards on demand; real pools pay about 5% a year.");
  console.log("Contracts: Top Level Accounts registry + wallet, unmodified, prebuilt from");
  console.log("houseofstake/tla-contracts @ d85860a. The Steward is new and unaudited.\n");
  console.log("Starting a local NEAR sandbox and deploying the contracts...");

  const sb = await startSandbox({ people: ["ana", "ben", "fan", "keeper"] });
  const { client } = sb;
  const [ana, ben, fan, keeper] = ["ana", "ben", "fan", "keeper"].map(sb.account);
  try {
    step(1, "Price a Name");
    const price = await client.getPrice("alice.demo");
    say(`alice.demo costs ${near(price.rentYocto)} per term (about $${price.rentUsd.toFixed(2)} at $${price.nearUsd}/NEAR).`);
    say(
      `Real world: at ${REAL_APY}% staking yield, ${near(stakeNeededYocto(price.rentYocto, REAL_APY))} staked once ` +
        `pays this Rent every year.`,
    );

    step(2, "Rent two Names");
    const alice = await client.rent(ana, "alice.demo");
    const bob = await client.rent(ben, "bob.demo");
    check(alice.owner === "ana" && alice.status === "active", "alice.demo is rented by ana and Active");
    check(bob.owner === "ben" && bob.status === "active", "bob.demo is rented by ben and Active");
    say(`Each is an NFT in the registry and a live account. Both expire in about ${alice.secondsLeft}s.`);

    step(3, "Make alice.demo Evergreen");
    const stake = nearToYocto(30);
    const stewardId = await client.adopt(ana, "alice.demo", {
      pool: sb.poolId,
      stakeYocto: stake,
      stewardWasm: sb.stewardWasm,
      windowSecs: WINDOW,
      lapseGuardSecs: GUARD,
    });
    let s = await client.getSteward(stewardId);
    check(s.lease.owner === stewardId, `the Steward contract ${stewardId} now owns alice.demo`);
    check(s.stakedYocto === stake, `alice.demo staked ${near(stake)} of its own NEAR`);
    say("bob.demo stays as it is: no Steward, no stake.");

    step(4, "A stranger sends a Lifeline");
    await client.tip(fan, stewardId, nearToYocto(2));
    s = await client.getSteward(stewardId);
    const principal = s.principalYocto;
    check(s.tipCount === 1 && s.stakedYocto === principal, `fan's Tip joined the Stake: principal is now ${near(principal)}`);

    step(5, "Watch the Leases run out (about 2.5 minutes)");
    say("A Keeper pokes the Steward every few seconds. Anyone could; the Keeper holds no power over the Name.");
    say("DEMO ONLY: the pool drips rewards so a year of yield fits in a minute.");
    const bobLease = (await client.getLease("bob.demo"))!;
    let lastStep = "";
    let lastBob = "active";
    let drips = 0;
    while ((await client.chainTimeNs()) < bobLease.graceEndsAtNs + 2n * NS) {
      s = await client.getSteward(stewardId);
      // One term of rewards per term, like a real pool compressed in time.
      if (s.lease.secondsLeft <= WINDOW && s.rewardsYocto < s.rentYocto && s.phase === "Idle") {
        await sb.dripReward("alice.demo", (s.rentYocto * 12n) / 10n);
        drips++;
      }
      const result = await client.poke(keeper, stewardId);
      if (result !== lastStep && result !== "not_due") {
        const lease = (await client.getLease("alice.demo"))!;
        say(`alice.demo  ${result.padEnd(12)} ${lease.status}, ${lease.secondsLeft}s left`);
      }
      lastStep = result;
      const bobNow = await client.getLeaseStatus("bob.demo");
      if (bobNow !== lastBob) {
        const warnings = (await client.checkBeforePaying("bob.demo", { recentSecs: 0 })).warnings;
        say(`bob.demo    -> ${bobNow.toUpperCase()}  checkBeforePaying: ${warnings.map((w) => w.code).join(", ")}`);
        lastBob = bobNow;
      }
      await new Promise((r) => setTimeout(r, 2500));
    }

    step(6, "The result");
    s = await client.getSteward(stewardId);
    const bobCheck = await client.checkBeforePaying("bob.demo", { recentSecs: 0 });
    check(s.lease.status === "active", `alice.demo is still Active (${s.lease.secondsLeft}s left)`);
    check(s.renewals.length >= 2, `alice.demo renewed itself ${s.renewals.length} times with no payment from ana`);
    check(s.stakedYocto >= principal, `principal untouched: ${near(s.stakedYocto)} staked, principal ${near(principal)}`);
    check(s.lease.owner === stewardId, "the Steward still owns alice.demo");
    check((await client.getLeaseStatus("bob.demo")) === "reclaimable", "bob.demo is Reclaimable: anyone can take it");
    check(
      bobCheck.warnings.some((w) => w.code === "RECLAIMABLE"),
      "checkBeforePaying warns RECLAIMABLE before anyone pays bob.demo",
    );
    say(`Rewards dripped by the DEMO pool: ${drips} times.`);

    step(7, "ana takes her Name back");
    await client.exit(ana, stewardId);
    check((await client.getLease("alice.demo"))!.owner === "ana", "alice.demo is back with ana; a Name is never locked in");

    console.log("\nDemo passed.");
  } finally {
    await sb.stop();
  }
}
