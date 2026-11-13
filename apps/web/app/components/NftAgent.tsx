"use client";

import { useEffect, useState } from "react";
import { Reveal } from "./Motion";

const RPC = "https://test.rpc.fastnear.com";
const REGISTRY = "registry.sachindraz.testnet";
const POOL = "aurora.pool.f863973.m0";
const NAME = "evergreen.ev.sachindraz.testnet";

/** What the token can do once it has a Steward. Every line is proven in the repo's tests or on testnet. */
const POWERS = [
  { title: "It is a wallet", text: "The token is also a real NEAR account. It holds its own NEAR and signs its own actions." },
  { title: "It earns", text: "The NFT itself is the staker. Its stake and its rewards sit with a validator, in its own name." },
  { title: "It pays its own bills", text: "Each year, its Steward pays its Rent from its rewards only. The principal is never touched." },
  { title: "It can't die of neglect", text: "No server, no reminder. Anyone may poke it; it renews itself inside the window." },
  { title: "Strangers can keep it alive", text: "Anyone can send a Lifeline. A community can fund an NFT it cares about, forever." },
  { title: "Code owns it, you get it back", text: "Its owner on the NFT contract is a program. One call and it returns to you, money and stake included." },
];

async function view<T>(contract: string, method: string, args: object): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: contract, method_name: method, args_base64: btoa(JSON.stringify(args)) },
    }),
  });
  const json = await res.json();
  if (!json.result?.result) throw new Error("rpc");
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(json.result.result as number[])));
}

type Token = { token_id: string; owner_id: string; metadata?: { extra?: string } };
type Proof = { token: Token; staked: string };

const near = (yocto: string) => (Number(BigInt(yocto) / 10n ** 21n) / 1000).toFixed(3);

/** The NFT, read live from NEAR testnet: owned by a contract, and staking in its own name. */
function LiveToken() {
  const [proof, setProof] = useState<Proof | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    Promise.all([
      view<Token>(REGISTRY, "nft_token", { token_id: NAME }),
      view<string>(POOL, "get_account_staked_balance", { account_id: NAME }),
    ])
      .then(([token, staked]) => setProof({ token, staked }))
      .catch(() => setFailed(true));
  }, []);

  if (failed) return null;
  const expires = proof?.token.metadata?.extra ? JSON.parse(proof.token.metadata.extra).expires_at : null;
  return (
    <figure className="nft-proof" aria-busy={!proof}>
      <figcaption className="small">
        Live from NEAR testnet · <code>{REGISTRY}.nft_token</code> (NEP-171)
      </figcaption>
      <pre>
        <code>
          {"{\n"}
          {`  "token_id": "${NAME}",\n`}
          {`  "owner_id": `}
          <mark>{proof ? `"${proof.token.owner_id}"` : "…"}</mark>
          {proof && expires ? `,\n  "expires_at": "${new Date(Number(BigInt(expires) / 1_000_000n)).toISOString().slice(0, 10)}"` : ""}
          {"\n}"}
        </code>
      </pre>
      <p className="small">
        <mark>owner_id</mark> is the Steward: a contract, not a person. And the NFT&apos;s own account is staking{" "}
        <strong className="num">{proof ? near(proof.staked) : "…"} NEAR</strong> with <code>{POOL}</code>.{" "}
        <a href={`https://testnet.nearblocks.io/address/${NAME}`} target="_blank" rel="noreferrer">
          See it on the explorer
        </a>
      </p>
    </figure>
  );
}

export function NftAgent() {
  return (
    <section className="nft" id="nft">
      <Reveal>
        <h2>
          Not a name. An NFT with its own <em>bank account.</em>
        </h2>
        <p className="section-lede">
          Every NEAR Name is a NEP-171 token and, at the same time, a real account. Evergreen gives that token a job: it
          holds money, earns, pays for its own existence, and outlives anyone&apos;s attention.
        </p>
        <ol className="nft-powers">
          {POWERS.map((p) => (
            <li key={p.title}>
              <h3>{p.title}</h3>
              <p className="small">{p.text}</p>
            </li>
          ))}
        </ol>
        <div className="nft-live">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="nft-card-img" src={`/api/nft/${NAME}.png`} alt={`Live card of the NFT ${NAME}: its willow, Lease left and Stake`} width={1200} height={630} loading="lazy" />
          <LiveToken />
        </div>
      </Reveal>
    </section>
  );
}
