/** Everything the app and agents need to act on NEAR testnet. Browser- and server-safe. */
export const NET = {
  network: "testnet" as const,
  rpcUrl: "https://test.rpc.fastnear.com",
  /** House of Stake's Top Level Accounts registry, unmodified, deployed by us on testnet (theirs is paused: stale price oracle). */
  registryId: "registry.sachindraz.testnet",
  /** An Open namespace on that registry: anyone may rent `<label>.ev.sachindraz.testnet`. */
  namespace: "ev.sachindraz.testnet",
  /** A real testnet validator. */
  pool: "aurora.pool.f863973.m0",
  /**
   * Publishes the Steward as a NEAR global contract (each Steward points at it) and runs the Steward factory
   * (contracts/steward-factory), which creates Stewards with one plain call any wallet can sign.
   */
  stewardCode: "evergreen-steward.testnet",
  /** Renewal starts 30 days before expiry; if Rent is still not covered 3 days before, the Stake is pulled to safety. */
  windowSecs: 30 * 86_400,
  lapseGuardSecs: 3 * 86_400,
  explorer: "https://testnet.nearblocks.io",
  hosRepo: "https://github.com/houseofstake/tla-contracts",
  repo: "https://github.com/SachPlayZ/Evergreen",
};

export const explorerAccount = (id: string) => `${NET.explorer}/address/${id}`;
export const explorerTx = (hash: string) => `${NET.explorer}/txns/${hash}`;

/** A valid NEAR account label: lowercase letters, digits, single - or _ between them, 2 to 64 chars. */
export const validLabel = (label: string) => /^(?=.{2,64}$)[a-z0-9]+([-_][a-z0-9]+)*$/.test(label);
