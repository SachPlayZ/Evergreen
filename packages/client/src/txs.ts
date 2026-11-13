/**
 * Every Evergreen action as plain transactions: `{ receiverId, actions }`, ready for a browser wallet
 * (`signAndSendTransactions`) or a near-api-js Account (`sendTxs`). No signing, no I/O, browser-safe.
 * One builder per action a Name owner can take; the CLI, the tests and the web app share them.
 */
import { actions, type Account } from "near-api-js";
import { ONE_YOCTO, TGAS, TxError } from "./near";

export type Action = ReturnType<typeof actions.transfer>;
export interface Tx {
  receiverId: string;
  actions: Action[];
}

/** The Steward's code: a NEAR global contract published once (tiny tx), or the wasm itself (150 KB). */
export type StewardCode = { globalAccountId: string } | { wasm: Uint8Array };

const WALLET_OVERHEAD = 20n * TGAS;
const POOL_GAS = 30n * TGAS;

function split(name: string) {
  const dot = name.indexOf(".");
  if (dot <= 0) throw new Error(`"${name}" is not a Name like alice.demo`);
  return { label: name.slice(0, dot), namespace: name.slice(dot + 1) };
}

const call = (method: string, args: object, gas: bigint, deposit = 0n): Action => actions.functionCall(method, args, gas, deposit);

/** The Steward account for a Name: a keyless sub-account of its Patron. */
export function stewardIdFor(name: string, patronId: string): string {
  const { label, namespace } = split(name);
  return `ev-${label}-${namespace.replace(/\./g, "-")}.${patronId}`;
}

/** Rent a free Name. `totalYocto` is `get_rent_price(...).total_yocto` (Rent + account creation). */
export function rentTx(registryId: string, name: string, totalYocto: bigint): Tx {
  const { label, namespace } = split(name);
  return { receiverId: registryId, actions: [call("rent_sub_account", { tla_id: namespace, name: label }, 300n * TGAS, totalYocto)] };
}

/** Pay one term of Rent for any Name (anyone may). Excess becomes the payer's pending refund. */
export function renewTx(registryId: string, name: string, rentYocto: bigint): Tx {
  const { label, namespace } = split(name);
  return { receiverId: registryId, actions: [call("renew_sub_account", { tla_id: namespace, name: label }, 150n * TGAS, rentYocto)] };
}

/** Owner only. The transfer sweeps the Name's plain NEAR to its Payout Account (you), then hands it over. */
export function transferNameTx(registryId: string, name: string, newOwner: string): Tx {
  const { label, namespace } = split(name);
  return {
    receiverId: registryId,
    actions: [call("transfer_sub_account", { tla_id: namespace, name: label, new_owner: newOwner }, 150n * TGAS, ONE_YOCTO)],
  };
}

export function claimRefundTx(registryId: string): Tx {
  return { receiverId: registryId, actions: [call("claim_refund", {}, 30n * TGAS)] };
}

/**
 * Makes a Name Evergreen in two transactions: create the Steward holding the Stake, then send it the
 * NFT with `nft_transfer_call`. On arrival the Steward moves the Stake onto the Name and stakes it.
 * The Name is funded only after the hand-over, because the transfer sweeps the Name's NEAR.
 */
export function adoptTxs(o: {
  registryId: string;
  name: string;
  patron: string;
  pool: string;
  stakeYocto: bigint;
  windowSecs: number;
  lapseGuardSecs: number;
  code: StewardCode;
  /** NEAR left on the Steward account for its storage. Default 0.3 (global code) or 2 (own wasm). */
  stewardBalanceYocto?: bigint;
  /** Plain NEAR left on the Name next to the Stake. Default 0.5. */
  liquidBufferYocto?: bigint;
}): Tx[] {
  const { label, namespace } = split(o.name);
  const stewardId = stewardIdFor(o.name, o.patron);
  const global = "globalAccountId" in o.code;
  const balance = o.stewardBalanceYocto ?? (global ? 3n : 20n) * 10n ** 23n;
  const buffer = o.liquidBufferYocto ?? 5n * 10n ** 23n;
  const NS = 1_000_000_000n;
  const code = "globalAccountId" in o.code ? actions.useGlobalContract({ accountId: o.code.globalAccountId }) : actions.deployContract(o.code.wasm);
  return [
    {
      receiverId: stewardId,
      actions: [
        actions.createAccount(),
        // The Steward holds the Stake until the NFT arrives, then moves it onto the Name.
        actions.transfer(balance + o.stakeYocto + buffer),
        code,
        call(
          "new",
          {
            registry: o.registryId,
            tla_id: namespace,
            label,
            pool: o.pool,
            patron: o.patron,
            window_ns: (BigInt(o.windowSecs) * NS).toString(),
            lapse_guard_ns: (BigInt(o.lapseGuardSecs) * NS).toString(),
          },
          30n * TGAS,
        ),
      ],
    },
    sendNftTx(o.registryId, o.name, stewardId, JSON.stringify({ stake: o.stakeYocto.toString() })),
  ];
}

/**
 * Owner: send the Name (a NEP-171 token) to a contract with `nft_transfer_call`. A Steward receiving its
 * own Name from its Patron funds the Name and stakes it in the same call (`msg` = `{"stake":"<yocto>"}`);
 * anything else is handed back by the registry.
 */
export function sendNftTx(registryId: string, name: string, receiverId: string, msg = ""): Tx {
  return { receiverId: registryId, actions: [call("nft_transfer_call", { receiver_id: receiverId, token_id: name, msg }, 300n * TGAS, ONE_YOCTO)] };
}

/** Anyone: advance the Steward one step (it does nothing if nothing is due). */
export function pokeTx(stewardId: string): Tx {
  return { receiverId: stewardId, actions: [call("poke", {}, 300n * TGAS)] };
}

/** Anyone: add NEAR to an Evergreen Name's Stake (a Lifeline). It joins the principal. */
export function tipTx(stewardId: string, amountYocto: bigint): Tx {
  return { receiverId: stewardId, actions: [call("tip", {}, 100n * TGAS, amountYocto)] };
}

/** Patron: take the Name back. Its Stake stays on the Name, in the pool. */
export function exitTx(stewardId: string): Tx {
  return { receiverId: stewardId, actions: [call("exit", {}, 300n * TGAS)] };
}

// ---- Owner acting through the Name's own wallet (House of Stake wallet, `w_execute_extension`) ----

function nameExecutes(name: string, receiverId: string, inner: object, gas: bigint): Tx {
  return {
    receiverId: name,
    actions: [call("w_execute_extension", { request: { external: [{ receiver_id: receiverId, actions: [inner] }] } }, gas + WALLET_OVERHEAD, ONE_YOCTO)],
  };
}

const poolCall = (method: string, args: object = {}, deposit = 0n) => ({
  action: "function_call",
  payload: { function_name: method, args: btoa(JSON.stringify(args)), deposit: deposit.toString(), gas: POOL_GAS.toString() },
});

/** Owner: send plain NEAR from the Name to any account (keeps the wallet's small storage reserve). */
export function withdrawFromNameTx(name: string, to: string, amountYocto: bigint): Tx {
  return nameExecutes(name, to, { action: "transfer", payload: { amount: amountYocto.toString() } }, 10n * TGAS);
}

/** Owner (after exit): ask the pool to release the Name's whole Stake. Withdrawable ~4 epochs later. */
export function unstakeAllTx(name: string, pool: string): Tx {
  return nameExecutes(name, pool, poolCall("unstake_all"), POOL_GAS);
}

/** Owner (after exit): move `amountYocto` of unstaked NEAR (once available) from the pool back onto the Name. */
export function withdrawFromPoolTx(name: string, pool: string, amountYocto: bigint): Tx {
  return nameExecutes(name, pool, poolCall("withdraw", { amount: amountYocto.toString() }), POOL_GAS);
}

/** Owner: stake the Name's plain NEAR yourself (no Steward). */
export function stakeFromNameTx(name: string, pool: string, amountYocto: bigint): Tx {
  return nameExecutes(name, pool, poolCall("deposit_and_stake", {}, amountYocto), POOL_GAS);
}

/** Signs and sends each transaction in order with a near-api-js Account; throws TxError on any failed receipt. */
export async function sendTxs(signer: Account, txs: Tx[]): Promise<void> {
  for (const tx of txs) {
    const outcome: any = await signer.signAndSendTransaction({ receiverId: tx.receiverId, actions: tx.actions, waitUntil: "FINAL", throwOnFailure: false });
    const all = [outcome?.transaction_outcome, ...(outcome?.receipts_outcome ?? [])];
    const failed = all.find((o) => o?.outcome?.status?.Failure) ?? (outcome?.status?.Failure ? outcome : undefined);
    if (failed) {
      const failure = failed.outcome?.status?.Failure ?? failed.status?.Failure;
      throw new TxError(`${tx.receiverId}`, JSON.stringify(failure).slice(0, 400));
    }
  }
}
