#!/usr/bin/env node
/**
 * evergreen: one command per step of the Evergreen story.
 *
 *   evergreen demo                      run the whole story in a fresh sandbox
 *   evergreen sandbox [--story] [--port 3030]
 *                                       start a sandbox and keep it running (--story sets up alice.demo and bob.demo)
 *   evergreen price <name>
 *   evergreen rent <name> --as <account>
 *   evergreen status <name>
 *   evergreen check <name> [--expect-owner <account>]
 *   evergreen renew <name> --as <account>       pay a Name's Rent (a direct Lifeline)
 *   evergreen steward adopt <name> --as <patron> [--stake 30]
 *   evergreen tip <name> <near> --as <account>
 *   evergreen poke <name> --as <account>
 *   evergreen keeper run [--restart-on-lapse]   keep poking every Evergreen Name
 *   evergreen exit <name> --as <patron>
 *   evergreen testnet deploy --account <you.testnet> [--rpc <url>]
 *                                       deploy the stack and the live scene to testnet (resumes if it stops)
 *
 * Commands talk to the sandbox started by `evergreen sandbox`. With EVERGREEN_NETWORK=testnet
 * they talk to the testnet copy in deploy/testnet.json instead, and every signer is its account.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Evergreen, ONE_YOCTO, call, nearToYocto, stakeNeededYocto, yoctoToNear } from "@evergreen-names/client";
import { IDS, startSandbox, wasm } from "@evergreen-names/sandbox";
import { deployTestnet, testnetKey } from "@evergreen-names/sandbox/testnet";
import { DEFAULT_PRIVATE_KEY } from "near-sandbox";
import { runDemo } from "./demo";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const SANDBOX_FILE = join(ROOT, ".evergreen/sandbox.json");
const TESTNET_FILE = join(ROOT, "deploy/testnet.json");
const ENV_FILE = process.env.EVERGREEN_NETWORK === "testnet" ? TESTNET_FILE : SANDBOX_FILE;
const PEOPLE = ["ana", "ben", "fan", "keeper"];
/** `keeper run --restart-on-lapse` exits with this when an Evergreen Name lapses (see deploy/evergreen-keeper.service). */
const LAPSED_EXIT = 75;
const near = (y: bigint) => `${yoctoToNear(y, 3)} NEAR`;

interface Env {
  rpcUrl: string;
  registryId: string;
  namespace: string;
  poolId: string;
  /** Name -> Steward account. */
  stewards: Record<string, string>;
  /** Testnet: the one account that signs for every role. */
  root?: string;
}

function loadEnv(): Env {
  if (!existsSync(ENV_FILE)) {
    throw new Error(
      ENV_FILE === TESTNET_FILE
        ? "No testnet deploy yet. Run `pnpm evergreen testnet deploy --account <you.testnet>`."
        : "No sandbox is running. Start one with `pnpm evergreen sandbox` in another terminal.",
    );
  }
  return JSON.parse(readFileSync(ENV_FILE, "utf8"));
}

function saveEnv(env: Env, file = ENV_FILE): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(env, null, 2)}\n`);
}

/** Signs as `role`. On testnet every role is the deploying account, with its one key. */
function signerFor(client: Evergreen, env: Env, role: string) {
  return env.root ? client.account(env.root, testnetKey(env.root)) : client.account(role, DEFAULT_PRIVATE_KEY);
}

function parse(argv: string[]) {
  const flags: Record<string, string> = {};
  const words: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "";
    else words.push(argv[i]);
  }
  return { words, flags };
}

async function main(): Promise<void> {
  const { words, flags } = parse(process.argv.slice(2));
  const [command, ...rest] = words;

  if (command === "demo") {
    await runDemo();
    process.exit(0); // nothing left to wait for; don't let a stray handle keep a judge's terminal open
  }

  if (command === "testnet") {
    if (rest[0] !== "deploy" || !flags.account) throw new Error("Usage: evergreen testnet deploy --account <you.testnet>");
    console.log(`Deploying to testnet under ${flags.account}. Each step runs once; run again to resume.`);
    const { state } = await deployTestnet({ root: flags.account, statePath: TESTNET_FILE, rpcUrl: flags.rpc || undefined });
    console.log(`Done. alice.${state.namespace} is Evergreen; bob.${state.namespace} has no Steward.`);
    console.log("Point the web page at it with these env vars:");
    console.log(`  EVERGREEN_RPC_URL=${state.rpcUrl}`);
    console.log(`  EVERGREEN_REGISTRY_ID=${state.registryId}`);
    console.log(`  EVERGREEN_NAMESPACE=${state.namespace}`);
    console.log(`  EVERGREEN_TERM_SECS=${state.termSecs}`);
    console.log(`  EVERGREEN_NETWORK_LABEL=testnet copy`);
    console.log("Then keep it alive: EVERGREEN_NETWORK=testnet pnpm evergreen keeper run");
    return;
  }

  if (command === "sandbox") {
    if (ENV_FILE !== SANDBOX_FILE) throw new Error("Unset EVERGREEN_NETWORK to start a sandbox.");
    console.log("Starting sandbox (60s Leases, 60s Grace, DEMO pool)...");
    const sb = await startSandbox({ people: PEOPLE, rpcPort: flags.port ? Number(flags.port) : undefined });
    saveEnv({ rpcUrl: sb.rpcUrl, registryId: sb.registryId, namespace: sb.namespace, poolId: sb.poolId, stewards: {} }, SANDBOX_FILE);
    console.log(`Sandbox ready at ${sb.rpcUrl}. Namespace: ${sb.namespace}. People: ${PEOPLE.join(", ")}.`);
    if (flags.story !== undefined) {
      // A live scene for the web page: alice.demo is Evergreen, bob.demo is left alone.
      const { client } = sb;
      const [ana, ben, fan] = ["ana", "ben", "fan"].map(sb.account);
      await client.rent(ana, "alice.demo");
      await client.rent(ben, "bob.demo");
      const stewardId = await client.adopt(ana, "alice.demo", {
        pool: sb.poolId,
        stakeYocto: nearToYocto(30),
        stewardWasm: sb.stewardWasm,
        windowSecs: 35,
        lapseGuardSecs: 12,
      });
      await client.tip(fan, stewardId, nearToYocto(2));
      saveEnv({ rpcUrl: sb.rpcUrl, registryId: sb.registryId, namespace: sb.namespace, poolId: sb.poolId, stewards: { "alice.demo": stewardId } }, SANDBOX_FILE);
      console.log("Story started: alice.demo is Evergreen (30 NEAR staked, 1 Tip); bob.demo has no Steward.");
      console.log("Now run `pnpm evergreen keeper run` in another terminal, and `pnpm dev:web` to watch.");
    }
    console.log("Leave this running. Ctrl+C stops it.");
    process.on("SIGINT", async () => {
      await sb.stop();
      process.exit(0);
    });
    return new Promise(() => {});
  }

  if (!command || command === "help") {
    const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
    console.log(source.slice(source.indexOf("/**") + 4, source.indexOf("*/")).replace(/^ \* ?/gm, ""));
    return;
  }
  const env = loadEnv();
  const client = new Evergreen(env);
  const signer = () => {
    if (!flags.as) throw new Error("Say who signs with --as <account>, e.g. --as ana");
    return signerFor(client, env, flags.as);
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
      const keeper = signerFor(client, env, "keeper");
      const relay = signerFor(client, env, IDS.relay);
      const council = signerFor(client, env, IDS.council);
      const renter = signerFor(client, env, "ben");
      console.log("Keeper running. Checks every Evergreen Name every 3s and pokes when due. DEMO: also drips pool rewards. Ctrl+C stops it.");
      let ticks = 0;
      const gone: Record<string, number> = {};
      for (;;) {
        for (const [evergreen, stewardId] of Object.entries(loadEnv().stewards)) {
          try {
            const s = await client.getSteward(stewardId);
            const inWindow = s.lease.secondsLeft <= Number(s.windowNs / 1_000_000_000n);
            if (inWindow && s.rewardsYocto < s.rentYocto && s.phase === "Idle") {
              await call(relay, env.poolId, "drip_reward", { account_id: evergreen }, { deposit: (s.rentYocto * 12n) / 10n });
            }
            // A poke is a transaction; only send one when the Steward has something to do.
            const evacuated = typeof s.phase === "object" && "Evacuated" in s.phase;
            if (evacuated || (s.phase === "Idle" && !inWindow)) continue;
            const result = await client.poke(keeper, stewardId);
            if (result !== "not_due") console.log(`${evergreen}: ${result} (${s.lease.secondsLeft}s left)`);
          } catch (error: any) {
            console.log(`${evergreen}: ${error.message}`);
          }
        }
        // DEMO loop: once a Name without a Steward has sat Reclaimable for 20s, reclaim it and
        // rent it again, so the page keeps showing a Name running out.
        // A failed read (a public RPC hiccup) skips this round instead of stopping the keeper.
        const leases = await client.listNames(env.namespace).catch((error) => {
          console.log(`listing Names: ${error.message}`);
          return [];
        });
        for (const lease of leases) {
          if (lease.status !== "reclaimable") continue;
          if (loadEnv().stewards[lease.name]) {
            // An Evergreen Name lapses only if the Keeper was starved or down (its stake is safe:
            // the lapse guard pulled it back). Hosted demo: exit so systemd starts a fresh chain.
            if (flags["restart-on-lapse"] === undefined) continue;
            console.log(`${lease.name}: lapsed; exiting ${LAPSED_EXIT} so the demo chain restarts`);
            process.exit(LAPSED_EXIT);
          }
          const since = (gone[lease.name] ??= Date.now());
          if (Date.now() - since < 20_000) continue;
          delete gone[lease.name];
          try {
            await call(relay, env.registryId, "reclaim_finalize", { tla_id: lease.namespace, name: lease.label });
            await client.rent(renter, lease.name);
            console.log(`${lease.name}: reclaimed and rented again by ${renter.accountId} (demo loop)`);
          } catch (error: any) {
            console.log(`${lease.name}: ${error.message}`);
          }
        }
        // The NEAR/USD rate goes stale after 6h; refresh it now and then (cooldown is 5 min).
        if (++ticks % 120 === 0) {
          await client.rpc
            .callFunction({ contractId: env.registryId, method: "get_near_usd_rate", args: {} })
            .then((rate) => call(council, env.registryId, "set_near_usd_rate", { rate }, { deposit: ONE_YOCTO }))
            .catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    default:
      throw new Error(`Unknown command "${command}". Run "evergreen help".`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
