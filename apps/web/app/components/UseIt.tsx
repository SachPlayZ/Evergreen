"use client";

import { ArrowRight, Check, Copy } from "@phosphor-icons/react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Reveal } from "./Motion";

const NAMESPACE = "ev.sachindraz.testnet";
const REPO = "https://github.com/SachPlayZ/Evergreen";
const explorer = (id: string) => `https://testnet.nearblocks.io/address/${id}`;

/** One shell command with a copy button that says when it worked. */
function Cmd({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  const copy = () =>
    Promise.resolve(navigator.clipboard?.writeText(text))
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      // Clipboard blocked: select the command so Cmd/Ctrl+C still works.
      .catch(() => pre.current && getSelection()?.selectAllChildren(pre.current));
  return (
    <div className="cmd">
      <pre ref={pre}>
        <code>{text}</code>
      </pre>
      <button type="button" onClick={copy} aria-label={copied ? "Copied" : "Copy command"}>
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <span>{copied ? "Copied" : "Copy"}</span>
      </button>
    </div>
  );
}

const clean = (s: string, fallback: string) => s.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "") || fallback;

/** How anyone makes their own Name Evergreen on NEAR testnet, with their own account and label filled in. */
export function UseIt() {
  const [account, setAccount] = useState("");
  const [label, setLabel] = useState("");
  const you = clean(account, "you.testnet");
  const mine = clean(label, "mybot").replace(/\./g, "");
  const name = `${mine}.${NAMESPACE}`;

  return (
    <section className="use" id="use">
      <Reveal>
        <h2>
          Make your own Name <em>Evergreen.</em>
        </h2>
        <p className="section-lede">
          On NEAR testnet, today, with free testnet NEAR. A real Name, a Steward of your own, staked with a real
          validator.
        </p>
        <p className="use-cta">
          <Link className="btn" href="/app">
            Open the app <ArrowRight aria-hidden="true" />
          </Link>
          <span className="small">Connect a wallet, rent, stake, manage. Or do it all from a terminal:</span>
        </p>

        <div className="use-fields">
          <label>
            <span>Your testnet account</span>
            <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="you.testnet" spellCheck={false} autoCapitalize="off" />
          </label>
          <label>
            <span>The Name you want</span>
            <span className="use-name">
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="mybot" spellCheck={false} autoCapitalize="off" />
              <code>.{NAMESPACE}</code>
            </span>
          </label>
        </div>

        <ol className="use-steps">
          <li>
            <h3>Get a testnet account</h3>
            <p className="small">Free. NEAR&apos;s faucet funds it with 10 testnet NEAR and saves the key where Evergreen looks.</p>
            <Cmd text={`npx near-cli-rs account create-account sponsor-by-faucet-service ${you} autogenerate-new-keypair save-to-legacy-keychain network-config testnet create`} />
          </li>
          <li>
            <h3>Rent a Name</h3>
            <p className="small">
              <code>{name}</code> becomes yours for a year: an NFT and a real account. 0.01 NEAR.
            </p>
            <Cmd text={`git clone ${REPO} && cd Evergreen && pnpm install`} />
            <Cmd text={`pnpm evergreen testnet rent ${mine} --account ${you}`} />
          </li>
          <li>
            <h3>Make it Evergreen</h3>
            <p className="small">
              You sign two transactions: create your Steward holding the Stake, then send it the NFT. On arrival it funds the Name and stakes. About 3.8 NEAR: 3 staked
              and never spent, 0.3 for the Steward account, 0.5 left on the Name.
            </p>
            <Cmd text={`pnpm evergreen testnet adopt ${mine} --account ${you} --stake 3`} />
          </li>
          <li>
            <h3>Leave it</h3>
            <p className="small">
              Our keeper pokes every Evergreen Name in <code>{NAMESPACE}</code> when Rent is due. Anyone can. You can check on
              it, top it up, or take it back whenever you like.
            </p>
            <Cmd text={`pnpm evergreen testnet status ${mine}`} />
            <Cmd text={`pnpm evergreen testnet exit ${mine} --account ${you}`} />
          </li>
        </ol>

        <p className="fine">
          Tried from a brand-new faucet account on 14 Nov 2026:{" "}
          <a href={explorer(`hello.${NAMESPACE}`)} target="_blank" rel="noreferrer">
            <code>hello.{NAMESPACE}</code>
          </a>
          . Not on mainnet yet, on purpose: the Steward is new and unaudited. Nothing in it is testnet-only, so the same
          steps work on a mainnet Name after an audit.{" "}
          <a href={`${REPO}#use-it-make-your-own-name-evergreen-near-testnet`}>Full guide</a>
        </p>
      </Reveal>
    </section>
  );
}
