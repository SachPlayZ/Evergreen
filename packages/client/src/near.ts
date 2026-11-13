import { Account, JsonRpcProvider } from "near-api-js";

export const YOCTO = 10n ** 24n;
export const TGAS = 10n ** 12n;
export const ONE_YOCTO = 1n;

export function nearToYocto(near: number | string): bigint {
  const [whole, frac = ""] = String(near).split(".");
  return BigInt(whole) * YOCTO + BigInt((frac + "0".repeat(24)).slice(0, 24));
}

export function yoctoToNear(yocto: bigint | string, digits = 3): string {
  const unit = 10n ** BigInt(24 - digits);
  const rounded = (BigInt(yocto) + unit / 2n) / unit;
  const scale = 10n ** BigInt(digits);
  const whole = rounded / scale;
  return digits > 0 ? `${whole}.${(rounded % scale).toString().padStart(digits, "0")}` : `${whole}`;
}

export function provider(rpcUrl: string): JsonRpcProvider {
  return new JsonRpcProvider({ url: rpcUrl });
}

export async function view<T>(
  rpc: JsonRpcProvider,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return (await rpc.callFunction({ contractId, method, args })) as T;
}

export interface CallOptions {
  deposit?: bigint;
  gas?: bigint;
}

/** A transaction whose own call, or any receipt it spawned, failed. `reason` is the contract's error code or panic text. */
export class TxError extends Error {
  constructor(
    public readonly method: string,
    public readonly reason: string,
  ) {
    super(`${method} failed: ${reason}`);
  }
}

/**
 * Calls a contract method and waits for every receipt, including detached ones.
 * Throws TxError if any receipt failed. Returns the method's decoded return value.
 */
export async function call<T = unknown>(
  signer: Account,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
  { deposit = 0n, gas = 300n * TGAS }: CallOptions = {},
): Promise<T> {
  let outcome: any;
  try {
    outcome = await signer.callFunctionRaw({
      contractId,
      methodName: method,
      args,
      deposit,
      gas,
      waitUntil: "FINAL",
    });
  } catch (error: any) {
    // near-api-js throws when the call itself fails; normalise to TxError.
    throw new TxError(method, describe({ message: error?.message, error }));
  }
  const failure = firstFailure(outcome);
  if (failure) throw new TxError(method, failure);
  const value = outcome?.status?.SuccessValue;
  if (typeof value !== "string" || value === "") return undefined as T;
  const text = Buffer.from(value, "base64").toString();
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

function firstFailure(outcome: any): string | undefined {
  const all = [outcome?.transaction_outcome, ...(outcome?.receipts_outcome ?? [])];
  for (const o of all) {
    const failure = o?.outcome?.status?.Failure;
    if (failure) return describe(failure);
  }
  const top = outcome?.status?.Failure;
  return top ? describe(top) : undefined;
}

function describe(failure: unknown): string {
  const text = JSON.stringify(failure, (_key, value) => (typeof value === "bigint" ? value.toString() : value)).replace(/\\+"/g, '"');
  // Registry errors look like {"code":"sub_account_past_grace_period"}.
  const code = /Smart contract panicked: \{"code":"([a-z_]+)"/.exec(text);
  if (code) return code[1];
  const panic = /Smart contract panicked: ([^"]+)/.exec(text);
  return panic ? panic[1] : text;
}
