"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { NET } from "@/lib/testnet";

const SITE = "https://evergreen-names.vercel.app";

/** The whole agent brief, one paste. Mirrors /agents.md. */
export function agentPrompt(account = "<you.testnet>") {
  return `You manage NEAR Names (Top Level Accounts) for ${account} on NEAR testnet, using Evergreen.

Context
- A Name like mybot.${NET.namespace} is a NEP-171 NFT (${NET.registryId} nft_token) and a real NEAR account: the NFT holds its own NEAR and, with Evergreen, stakes it in its own name and pays its own Rent. It is leased for 1 year from House of Stake's Top Level Accounts registry (${NET.registryId}; Evergreen is not the rental service).
- Evergreen adds a Steward contract per Name (account ev-<label>-${NET.namespace.replace(/\./g, "-")}.<owner>). It owns the Name, stakes NEAR on it with ${NET.pool}, and pays Rent from staking rewards only; principal is never spent. Owner can take it back any time.
- RPC ${NET.rpcUrl}. Explorer ${NET.explorer}. Steward code: global contract ${NET.stewardCode}.
- Read state as JSON: GET ${SITE}/api/names?owner=${account}  (Names, Lease, NEAR on the Name, Stake, rewards, phase, pool position).
- Full method reference: ${SITE}/agents.md

How to act (pick one)
- CLI from the repo ${NET.repo} (signs with ~/.near-credentials/testnet/${account}.json):
  pnpm evergreen testnet rent <label> --account ${account}
  pnpm evergreen testnet adopt <label> --account ${account} --stake 3
  pnpm evergreen testnet status <label>
  pnpm evergreen testnet poke|exit <label> --account ${account}
  pnpm evergreen testnet tip <label> <near> --account ${account}
- Or near-cli-rs contract calls exactly as listed in /agents.md.

Rules
1. Testnet only. Never use mainnet keys or accounts.
2. Read state first (/api/names or get_status) and tell the user what you will do, the receiver, method and NEAR amount.
3. Ask before anything that moves NEAR or ownership: rent, adopt, tip, renew, exit, transfer, withdraw, unstake. Poke and reads are always fine.
4. Never transfer a Name or send NEAR to an account the user did not name.
5. Renewal is automatic for Evergreen Names: do not pay Rent by hand unless the Steward phase is Evacuated or the Lease is in Grace.
6. After exit, the Stake is still in the pool on the Name: unstake_all, wait ~4 epochs (~2 days), withdraw_all, then withdraw NEAR from the Name.`;
}

export function AgentKit({ accountId }: { accountId?: string }) {
  const prompt = agentPrompt(accountId);
  return (
    <section className="app-section" id="agents">
      <h2>For agents</h2>
      <p className="small">
        Everything above can be done by an AI agent. Give it this prompt (it fills in your account), the JSON state endpoint, and
        the method reference. It reads first, asks before moving NEAR, and never touches mainnet.
      </p>
      <div className="agent-links">
        <CopyButton text={prompt} label="Copy agent prompt" />
        <a className="chip" href="/agents.md" target="_blank" rel="noreferrer">
          agents.md
        </a>
        <a className="chip" href={`/api/names?owner=${accountId ?? "evergreen-try-06844.testnet"}`} target="_blank" rel="noreferrer">
          /api/names
        </a>
        <a className="chip" href="/llms.txt" target="_blank" rel="noreferrer">
          llms.txt
        </a>
      </div>
      <pre className="agent-prompt">
        <code>{prompt}</code>
      </pre>
    </section>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="chip"
      onClick={() =>
        Promise.resolve(navigator.clipboard?.writeText(text))
          .then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          })
          .catch(() => {})
      }
    >
      {done ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />} {done ? "Copied" : label}
    </button>
  );
}
