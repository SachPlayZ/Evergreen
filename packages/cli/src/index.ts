#!/usr/bin/env node
/**
 * evergreen: one command per step of the Evergreen story.
 *
 *   evergreen demo                      run the whole story in a fresh sandbox
 *   evergreen sandbox                   start a sandbox and keep it running
 *   evergreen price <name>
 *   evergreen rent <name> --as <account>
 *   evergreen status <name>
 *   evergreen check <name> [--expect-owner <account>]
 *   evergreen renew <name> --as <account>       pay a Name's Rent (a direct Lifeline)
 *   evergreen steward adopt <name> --as <patron> [--stake 30]
 *   evergreen tip <name> <near> --as <account>
 *   evergreen poke <name> --as <account>
 *   evergreen keeper run                keep poking every Evergreen Name
 *   evergreen exit <name> --as <patron>
 *
 * All commands except `demo` talk to the sandbox started by `evergreen sandbox`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Evergreen, ONE_YOCTO, call, nearToYocto, stakeNeededYocto, yoctoToNear } from "@evergreen-names/client";
import { IDS, startSandbox, wasm } from "@evergreen-names/sandbox";
import { DEFAULT_PRIVATE_KEY } from "near-sandbox";
import { runDemo } from "./demo.js";

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../../.evergreen/sandbox.json");
const PEOPLE = ["ana", "ben", "fan", "keeper"];
const near = (y: bigint) => `${yoctoToNear(y, 3)} NEAR`;

interface Env {
  rpcUrl: string;
  registryId: string;
  namespace: string;
  poolId: string;
  /** Name -> Steward account. */
  stewards: Record<string, string>;
}

function loadEnv(): Env {
  if (!existsSync(ENV_FILE)) {
    throw new Error("No sandbox is running. Start one with `pnpm evergreen sandbox` in another terminal.");
  }
  return JSON.parse(readFileSync(ENV_FILE, "utf8"));
}

function saveEnv(env: Env): void {
  mkdirSync(dirname(ENV_FILE), { recursive: true });
  writeFileSync(ENV_FILE, JSON.stringify(env, null, 2));
}

function parse(argv: string[]) {
  const flags: Record<string, string> = {};
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i] ?? "";
    else words.push(argv[i]);
  }
  return { words, flags };
}

async function main(): Promise<void> {
  const { words, flags } = parse(process.argv.slice(2));
  const [command, ...rest] = words;

  if (command === "demo") return runDemo();

  if (command === "sandbox") {
    console.log("Starting sandbox (60s Leases, 60s Grace, DEMO pool)...");
    const sb = await startSandbox({ people: PEOPLE });
    saveEnv({ rpcUrl: sb.rpcUrl, registryId: sb.registryId, namespace: sb.namespace, poolId: sb.poolId, stewards: {} });
    console.log(`Sandbox ready at ${sb.rpcUrl}. Namespace: ${sb.namespace}. People: ${PEOPLE.join(", ")}.`);
    console.log("Leave this running. Ctrl+C stops it.");
    process.on("SIGINT", async () => {
      await sb.stop();
      process.exit(0);
    });
    return new Promise(() => {});
  }

  const env = loadEnv();
  const client = new Evergreen(env);
  const signer = () => {
    if (!flags.as) throw new Error("Say who signs with --as <account>, e.g. --as ana");
    return client.account(flags.as, DEFAULT_PRIVATE_KEY);
  };
  const stewardOf = (name: string) => {
    const id = env.stewards[name];
    if (!id) throw new Error(`${name} is not Evergreen yet. Run: evergreen steward adopt ${name} --as <patron>`);
    return id;
  };
  const name = rest[command === "steward" || command === "keeper" ? 1 : 0];

  switch (command) {
    case "price": {
      const p = await client.getPrice(name);
      console.log(`${name}: ${near(p.rentYocto)} per term (about $${p.rentUsd.toFixed(2)} at $${p.nearUsd}/NEAR)`);
      console.log(`Stake that pays this Rent yearly at 5% yield: ${near(stakeNeededYocto(p.rentYocto, 5))}`);
      break;
    }
    case "rent": {
      const lease = await client.rent(signer(), name);
      console.log(`${name} rented by ${lease.owner}. ${lease.status}, ${lease.secondsLeft}s left.`);
      break;
    }
    case "renew": {
      const lease = await client.renew(signer(), name);
      console.log(`${name} renewed by ${flags.as}. ${lease.status}, ${lease.secondsLeft}s left.`);
      break;
    }
    case "status": {
      const lease = await client.getLease(name);
      if (!lease) {
        console.log(`${name} is not rented.`);
        break;
      }
      console.log(`${name}: ${lease.status}, owner ${lease.owner}, ${lease.secondsLeft}s to expiry.`);
      if (env.stewards[name]) {
        const s = await client.getSteward(env.stewards[name]);
        console.log(
          `Evergreen: staked ${near(s.stakedYocto)}, principal ${near(s.principalYocto)}, rewards ${near(s.rewardsYocto)}, ` +
            `next Rent ${near(s.rentYocto)}, ${s.renewals.length} self-renewals, ${s.tipCount} Tips, phase ${JSON.stringify(s.phase)}`,
        );
      }
      break;
    }
    case "check": {
      const result = await client.checkBeforePaying(name, { expectOwner: flags["expect-owner"] });
      console.log(result.ok ? `${name}: no warnings.` : `${name}: ${result.warnings.length} warning(s)`);
      for (const w of result.warnings) console.log(`  ${w.code}: ${w.message}`);
      break;
    }
    case "steward": {
      if (rest[0] !== "adopt") throw new Error("Usage: evergreen steward adopt <name> --as <patron> [--stake 30]");
      const stewardId = await client.adopt(signer(), name, {
        pool: env.poolId,
        stakeYocto: nearToYocto(flags.stake ?? "30"),
        stewardWasm: wasm("steward"),
        windowSecs: Number(flags.window ?? 35),
        lapseGuardSecs: Number(flags.guard ?? 12),
      });
      env.stewards[name] = stewardId;
      saveEnv(env);
      console.log(`${name} is now Evergreen. Steward: ${stewardId}. Staked ${flags.stake ?? "30"} NEAR.`);
      break;
    }
    case "tip": {
      await client.tip(signer(), stewardOf(name), nearToYocto(rest[1] ?? "1"));
      console.log(`${flags.as} tipped ${rest[1] ?? "1"} NEAR to ${name}.`);
      break;
    }
    case "poke": {
      console.log(`${name}: ${await client.poke(signer(), stewardOf(name))}`);
      break;
    }
    case "exit": {
      await client.exit(signer(), stewardOf(name));
      delete env.stewards[name];
      saveEnv(env);
      console.log(`${name} is back with ${flags.as}.`);
      break;
    }
    case "keeper": {
      // DEMO: the Keeper also plays the pool's rewards and the price oracle.
      const keeper = client.account("keeper", DEFAULT_PRIVATE_KEY);
      const relay = client.account(IDS.relay, DEFAULT_PRIVATE_KEY);
      const council = client.account(IDS.council, DEFAULT_PRIVATE_KEY);
      console.log("Keeper running. Pokes every Evergreen Name every 3s. DEMO: also drips pool rewards. Ctrl+C stops it.");
      let ticks = 0;
      for (;;) {
        for (const [evergreen, stewardId] of Object.entries(loadEnv().stewards)) {
          try {
            const s = await client.getSteward(stewardId);
            if (s.lease.secondsLeft <= Number(s.windowNs / 1_000_000_000n) && s.rewardsYocto < s.rentYocto && s.phase === "Idle") {
              await call(relay, env.poolId, "drip_reward", { account_id: evergreen }, { deposit: (s.rentYocto * 12n) / 10n });
            }
            const result = await client.poke(keeper, stewardId);
            if (result !== "not_due") console.log(`${evergreen}: ${result} (${s.lease.secondsLeft}s left)`);
          } catch (error: any) {
            console.log(`${evergreen}: ${error.message}`);
          }
        }
        // The NEAR/USD rate goes stale after 6h; refresh it now and then (cooldown is 5 min).
        if (++ticks % 120 === 0) {
          const rate = await client.rpc.callFunction({ contractId: env.registryId, method: "get_near_usd_rate", args: {} });
          await call(council, env.registryId, "set_near_usd_rate", { rate }, { deposit: ONE_YOCTO }).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    default:
      console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n\/\*\*\n?/, "").replace(/^ \* ?/gm, ""));
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
