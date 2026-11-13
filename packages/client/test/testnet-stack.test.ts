/**
 * Rehearses the testnet deploy on a sandbox: the Top Level Accounts contracts at d12a84b (the version
 * House of Stake runs on testnet), wallets running wallet code published by account id (as
 * `impl.hosdemo.testnet` is), and the Steward renewing a one-year Lease from staking rewards.
 * DEMO pool here; the testnet deploy uses a real validator's pool.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { startBareSandbox, wasm } from "@evergreen-names/sandbox";
import { deployTestnet } from "@evergreen-names/sandbox/testnet";
import { Evergreen, call, nearToYocto } from "../src/index";

let sandbox: Awaited<ReturnType<typeof startBareSandbox>>;
const YEAR_NS = 365n * 86_400n * 1_000_000_000n;

beforeAll(async () => {
  sandbox = await startBareSandbox(["sach", "impl", "pool"]);
});
afterAll(async () => sandbox?.stop());

test("on House of Stake's testnet contracts, an Evergreen Name renews its one-year Lease from rewards", async () => {
  const boot = new Evergreen({ rpcUrl: sandbox.rpcUrl, registryId: "unused" });
  await boot.account("impl", sandbox.key).deployGlobalContract(wasm("d12a84b/hos_wallet"), "accountId");
  const pool = boot.account("pool", sandbox.key);
  await pool.deployContract(wasm("demo_pool"));
  await call(pool, "pool", "new", {});

  const { state, client } = await deployTestnet({
    root: "sach",
    key: sandbox.key,
    statePath: join(mkdtempSync(join(tmpdir(), "evergreen-")), "testnet.json"),
    rpcUrl: sandbox.rpcUrl,
    walletCode: "impl",
    pool: "pool",
    log: () => {},
  });
  const name = "evergreen.ev.sach";
  const stewardId = state.stewards[name];
  const root = client.account("sach", sandbox.key);

  const before = (await client.getLease(name))!;
  expect(before.owner).toBe(stewardId);
  let s = await client.getSteward(stewardId);
  expect(s.principalYocto).toBe(nearToYocto(1));
  expect(s.phase).toBe("Idle");

  // Real rewards would take days; the demo pool pays them now.
  await call(root, "pool", "drip_reward", { account_id: name }, { deposit: s.needYocto });
  const steps: string[] = [];
  for (let i = 0; i < 10 && steps.at(-1) !== "renewed"; i++) steps.push(await client.poke(root, stewardId));
  expect(steps).toEqual(["unstaking", "withdrawing", "renewing", "renewed"]);

  const after = (await client.getLease(name))!;
  expect(after.expiresAtNs - before.expiresAtNs).toBe(YEAR_NS);
  s = await client.getSteward(stewardId);
  expect(s.renewals).toHaveLength(1);
  expect(s.stakedYocto).toBeGreaterThanOrEqual(s.principalYocto);
  expect(s.principalYocto).toBe(nearToYocto(1));
}, 300_000);
