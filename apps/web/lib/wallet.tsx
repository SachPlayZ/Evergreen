"use client";

import type { NearConnector, NearWalletBase } from "@hot-labs/near-connect";
import type { Tx } from "@evergreen-names/client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { NET } from "./testnet";

interface WalletState {
  ready: boolean;
  accountId?: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Signs and sends every transaction in order (one wallet approval where the wallet allows). Returns tx hashes. */
  send(txs: Tx[]): Promise<string[]>;
}

const Ctx = createContext<WalletState | null>(null);

export function useWallet(): WalletState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet outside WalletProvider");
  return ctx;
}

/** NEAR Connect (the wallet selector docs.near.org recommends): Meteor, MyNearWallet, Intear and more, on testnet. */
export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const [ready, setReady] = useState(false);
  const [accountId, setAccountId] = useState<string>();

  useEffect(() => {
    let alive = true;
    import("@hot-labs/near-connect").then(async ({ NearConnector }) => {
      const c = new NearConnector({ network: NET.network, providers: { testnet: [NET.rpcUrl] }, footerBranding: null });
      connector.current = c;
      c.on("wallet:signIn", (p) => alive && setAccountId(p.accounts[0]?.accountId));
      c.on("wallet:signOut", () => alive && setAccountId(undefined));
      try {
        const [a] = await (await c.wallet()).getAccounts();
        if (alive && a) setAccountId(a.accountId);
      } catch {
        // not signed in
      }
      if (alive) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const connect = useCallback(async () => {
    const w = await connector.current!.connect();
    const [a] = await w.getAccounts();
    setAccountId(a?.accountId);
  }, []);

  const disconnect = useCallback(async () => {
    const c = connector.current!;
    await c.disconnect(await c.wallet());
    setAccountId(undefined);
  }, []);

  const send = useCallback(async (txs: Tx[]) => {
    const { nearActionsToConnectorActions } = await import("@hot-labs/near-connect");
    const w: NearWalletBase = await connector.current!.wallet();
    const transactions = txs.map((t) => ({ receiverId: t.receiverId, actions: nearActionsToConnectorActions(t.actions as never) }));
    const outcomes = transactions.length === 1
      ? [await w.signAndSendTransaction({ ...transactions[0], network: NET.network })]
      : await w.signAndSendTransactions({ transactions, network: NET.network });
    const failed = outcomes.find((o) => typeof o?.status === "object" && o.status && "Failure" in o.status);
    if (failed) throw new Error(`Transaction failed: ${JSON.stringify((failed.status as { Failure: unknown }).Failure).slice(0, 240)}`);
    return outcomes.map((o) => o?.transaction?.hash ?? o?.transaction_outcome?.id).filter(Boolean) as string[];
  }, []);

  return <Ctx.Provider value={{ ready, accountId, connect, disconnect, send }}>{children}</Ctx.Provider>;
}
