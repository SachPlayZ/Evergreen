"use client";

import {
  adoptTxs,
  claimRefundTx,
  exitTx,
  nearToYocto,
  pokeTx,
  rentTx,
  renewTx,
  stewardIdFor,
  tipTx,
  transferNameTx,
  unstakeAllTx,
  withdrawFromPoolTx,
  withdrawFromNameTx,
  type Tx,
} from "@evergreen-names/client";
import { ArrowUpRight, Check, CircleNotch, Leaf, SignOut, Warning, Wallet } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { balanceOf, client, namesOf, priceOf, type NameView } from "@/lib/names";
import { NET, explorerAccount, explorerTx, validLabel } from "@/lib/testnet";
import { SITE, sharePage } from "@/lib/site";
import { WalletProvider, useWallet } from "@/lib/wallet";
import { AgentKit } from "./AgentKit";

const YIELD = 0.05;
const STEWARD_BALANCE = 0.3;
const NAME_BUFFER = 0.5;
/** The Name wallet keeps a small storage reserve; leave this much when withdrawing. */
const NAME_RESERVE = 0.05;

const fmt = (yocto: string | bigint, digits = 4) => {
  const n = Number(BigInt(yocto) / 10n ** 16n) / 1e8;
  return n === 0 ? "0" : n < 10 ** -digits ? `<${(10 ** -digits).toFixed(digits)}` : n.toLocaleString("en-US", { maximumFractionDigits: digits });
};
const days = (s: number) => (s <= 0 ? "expired" : s < 172_800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86_400)} days`);
const parseNear = (s: string) => {
  const t = s.trim();
  return /^\d+(\.\d{1,24})?$/.test(t) && Number(t) > 0 ? nearToYocto(t) : undefined;
};

/** An X post linking the Name's share page; X previews it with the card from R2. */
const shareOnX = (name: string) => {
  const label = name.slice(0, -(NET.namespace.length + 1));
  const text = `My NFT pays its own rent. ${label} stakes its own NEAR and renews itself, forever. Built on NEAR with Evergreen.`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(sharePage(label))}`;
};

export function EvergreenApp() {
  return (
    <WalletProvider>
      <AppBody />
    </WalletProvider>
  );
}

// ---------- actions: sign, show progress, link the result ----------

interface Result {
  label: string;
  state: "busy" | "done" | "error";
  hashes?: string[];
  error?: string;
}

function useAct(refresh: () => void) {
  const { send } = useWallet();
  const [result, setResult] = useState<Result>();
  const act = useCallback(
    async (label: string, txs: Tx[]) => {
      setResult({ label, state: "busy" });
      try {
        const hashes = await send(txs);
        setResult({ label, state: "done", hashes });
      } catch (error) {
        setResult({ label, state: "error", error: error instanceof Error ? error.message : String(error) });
      } finally {
        setTimeout(refresh, 1500);
      }
    },
    [send, refresh],
  );
  return { act, result, clear: () => setResult(undefined) };
}

function Toast({ result, clear }: { result?: Result; clear(): void }) {
  if (!result) return null;
  return (
    <div className={`toast is-${result.state}`} role="status" aria-live="polite">
      {result.state === "busy" ? <CircleNotch className="spin" aria-hidden="true" /> : result.state === "done" ? <Check aria-hidden="true" /> : <Warning aria-hidden="true" />}
      <div>
        <p>
          {result.state === "busy" ? `${result.label}: approve in your wallet…` : result.state === "done" ? `${result.label}: done.` : `${result.label} did not go through.`}
        </p>
        {result.error && <p className="small">{result.error}</p>}
        {result.hashes?.map((h) => (
          <a key={h} href={explorerTx(h)} target="_blank" rel="noreferrer" className="small">
            {h.slice(0, 10)}… <ArrowUpRight aria-hidden="true" />
          </a>
        ))}
      </div>
      {result.state !== "busy" && (
        <button type="button" className="toast-x" onClick={clear} aria-label="Dismiss">
          ×
        </button>
      )}
    </div>
  );
}

// ---------- page ----------

function AppBody() {
  const { ready, accountId, connect, disconnect } = useWallet();
  // Read-only view of any account: /app?account=someone.testnet (for judges, agents, and sharing).
  const [lookup] = useState(() => new URLSearchParams(window.location.search).get("account")?.trim().toLowerCase() || undefined);
  const viewed = accountId ?? lookup;
  const readOnly = !accountId;
  const [loaded, setLoaded] = useState<{ account: string; names: NameView[] }>();
  const names = loaded?.account === viewed ? loaded?.names : undefined;
  const [balance, setBalance] = useState<string>();
  const [refund, setRefund] = useState<string>("0");
  const [loadError, setLoadError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!viewed) return;
    try {
      const [n, b, r] = await Promise.all([namesOf(viewed), balanceOf(viewed), client().pendingRefund(viewed)]);
      setLoaded({ account: viewed, names: n.sort((a, b) => a.name.localeCompare(b.name)) });
      setBalance(b);
      setRefund(r.toString());
      setLoadError(undefined);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }, [viewed]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const t = setInterval(refresh, 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh]);

  const { act, result, clear } = useAct(refresh);

  return (
    <>
      <header className="app-bar">
        <a className="wordmark" href={SITE}>
          Evergreen
        </a>
        <span className="net-badge">Testnet</span>
        <div className="app-bar-end">
          {accountId ? (
            <>
              <a className="acct" href={explorerAccount(accountId)} target="_blank" rel="noreferrer">
                <code>{accountId}</code>
                {balance && <span className="muted"> · {fmt(balance, 2)} NEAR</span>}
              </a>
              <button type="button" className="icon-btn" onClick={disconnect} aria-label="Disconnect wallet">
                <SignOut aria-hidden="true" />
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-sm" onClick={connect} disabled={!ready}>
              <Wallet aria-hidden="true" /> {ready ? (
                <>
                  Connect<span className="wide-only"> wallet</span>
                </>
              ) : (
                "Loading…"
              )}
            </button>
          )}
        </div>
      </header>

      <main className="app">
        <section className="app-intro">
          <h1>
            Rent a Name. Let it <em>keep itself.</em>
          </h1>
          <p className="section-lede">
            A NEAR Name is an NFT that is also an account. Rent one, give it NEAR to stake, and it pays its own Rent from
            the rewards every year. The rest of the rewards stay staked, and yours. Take it back whenever you like.
          </p>
          <Disclosure />
        </section>

        <Rent accountId={accountId} connect={connect} act={act} names={names} />

        <section className="app-section" id="names">
          <h2>Your Names</h2>
          {readOnly && viewed && (
            <p className="small">
              Viewing <code>{viewed}</code>, read-only. Connect that wallet to act.
            </p>
          )}
          {!viewed ? (
            <p className="small">Connect a testnet wallet to see and manage your Names. No wallet yet? Meteor and MyNearWallet both make a free testnet account.</p>
          ) : loadError ? (
            <p className="small warn">Could not read testnet: {loadError}</p>
          ) : !names ? (
            <div className="skeleton" aria-busy="true" />
          ) : names.length === 0 ? (
            <p className="small">No Names yet in {NET.namespace}. Rent one above.</p>
          ) : (
            <div className="name-list">
              {names.map((n) => (
                <NameCard key={n.name} n={n} me={viewed!} act={act} readOnly={readOnly} />
              ))}
            </div>
          )}
          {accountId && BigInt(refund) > 0n && (
            <p className="small">
              The registry owes you {fmt(refund)} NEAR of overpaid Rent.{" "}
              <button type="button" className="link" onClick={() => act("Claim refund", [claimRefundTx(NET.registryId)])}>
                Claim it
              </button>
            </p>
          )}
        </section>

        <AgentKit accountId={viewed} />
      </main>
      <Toast result={result} clear={clear} />
    </>
  );
}

function Disclosure() {
  return (
    <aside className="disclosure">
      <Leaf aria-hidden="true" />
      <div>
        <p>
          <strong>Evergreen is not a Name rental service.</strong> Names are leased from House of Stake&apos;s{" "}
          <a href={NET.hosRepo} target="_blank" rel="noreferrer">
            Top Level Accounts registry
          </a>
          , the official NEAR namespace service. Evergreen only adds a Steward: a small contract that holds your Name and pays
          its Rent from staking rewards. We never hold your NEAR; it stays on your Name, staked with a validator.
        </p>
        <p className="small">
          On testnet we run an unmodified copy of their registry (<code>{NET.registryId}</code>), because theirs is paused
          (its price oracle stopped updating). Testnet only: the Steward is new and unaudited.
        </p>
      </div>
    </aside>
  );
}

// ---------- rent ----------

type Act = (label: string, txs: Tx[]) => Promise<void>;

function Rent({ accountId, connect, act, names }: { accountId?: string; connect(): Promise<void>; act: Act; names?: NameView[] }) {
  const [label, setLabel] = useState("");
  const clean = label.trim().toLowerCase();
  const name = `${clean}.${NET.namespace}`;
  const [check, setCheck] = useState<{ name: string; free: boolean; owner?: string; totalYocto?: string; rentYocto?: string; rentUsd?: number }>();
  const valid = validLabel(clean);

  useEffect(() => {
    if (!valid) return;
    let alive = true;
    const t = setTimeout(async () => {
      const lease = await client().getLease(name).catch(() => undefined);
      const price = await priceOf(name).catch(() => undefined);
      if (alive) setCheck({ name, free: !lease, owner: lease?.owner, totalYocto: price?.totalYocto, rentYocto: price?.rentYocto, rentUsd: price?.rentUsd });
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [name, valid]);

  const mine = names?.some((n) => n.name === name);
  const current = valid && check?.name === name ? check : undefined;

  return (
    <section className="app-section" id="rent">
      <h2>1. Rent a Name</h2>
      <p className="small">
        A Name is an NFT and a real NEAR account, leased for one year from the House of Stake registry. Anyone can rent in the
        open namespace <code>{NET.namespace}</code>.
      </p>
      <div className="rent-row">
        <label className="field">
          <span className="sr">Name</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="mybot" spellCheck={false} autoCapitalize="off" autoComplete="off" />
          <code>.{NET.namespace}</code>
        </label>
        {!accountId ? (
          <button type="button" className="btn" onClick={connect}>
            <Wallet aria-hidden="true" /> Connect to rent
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            disabled={!current?.free || !current.totalYocto}
            onClick={() => act(`Rent ${name}`, [rentTx(NET.registryId, name, BigInt(current!.totalYocto!))])}
          >
            Rent for {current?.totalYocto ? `${fmt(current.totalYocto)} NEAR` : "…"}
          </button>
        )}
      </div>
      <p className="small rent-status" aria-live="polite">
        {!clean ? (
          "Lowercase letters, digits, - or _."
        ) : !valid ? (
          <span className="warn">Use 2 to 64 lowercase letters, digits, - or _ (not at the start or end).</span>
        ) : !current ? (
          "Checking…"
        ) : mine ? (
          <span className="ok">It&apos;s yours. Make it Evergreen below.</span>
        ) : current.free ? (
          <span className="ok">
            {name} is free. Rent {fmt(current.rentYocto ?? "0", 6)} NEAR a year (≈${(current.rentUsd ?? 0).toFixed(5)}) plus 0.01 NEAR to create the account.
          </span>
        ) : (
          <span className="warn">Taken by {current.owner}.</span>
        )}
      </p>
    </section>
  );
}

// ---------- a Name and everything you can do with it ----------

function NameCard({ n, me, act, readOnly }: { n: NameView; me: string; act: Act; readOnly: boolean }) {
  const [open, setOpen] = useState<string>();
  const toggle = (k: string) => setOpen((o) => (o === k ? undefined : k));
  const s = n.steward;
  const share = s && BigInt(s.needYocto) > 0n ? Math.min(1, Number((BigInt(s.rewardsYocto) * 1000n) / BigInt(s.needYocto)) / 1000) : 0;
  const poolLeft = n.pool && !n.evergreen && (BigInt(n.pool.stakedYocto) > 0n || BigInt(n.pool.unstakedYocto) > 0n);
  const withdrawable = BigInt(n.balanceYocto) - nearToYocto(NAME_RESERVE);

  return (
    <article className={`name-card ${n.evergreen ? "is-evergreen" : ""}`}>
      <header>
        <a href={explorerAccount(n.name)} target="_blank" rel="noreferrer">
          <code>{n.name}</code>
        </a>
        <span className={`pill is-${n.status}`}>{n.evergreen ? "Evergreen" : n.status}</span>
      </header>

      <dl className="name-stats">
        <div>
          <dt>Lease</dt>
          <dd>
            {days(n.secondsLeft)} left <span className="muted">· {new Date(n.expiresAtMs).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
          </dd>
        </div>
        <div>
          <dt>NEAR on the Name</dt>
          <dd>{fmt(n.balanceYocto)}</dd>
        </div>
        {s && (
          <>
            <div>
              <dt>Staked · principal</dt>
              <dd>
                {fmt(s.stakedYocto)} <span className="muted">· {fmt(s.principalYocto)} never spent</span>
              </dd>
            </div>
            <div>
              <dt>Rewards toward next Rent</dt>
              <dd>
                {fmt(s.rewardsYocto, 6)} of {fmt(s.needYocto, 6)}
                <span className="bar" aria-hidden="true">
                  <span style={{ width: `${share * 100}%` }} />
                </span>
              </dd>
            </div>
            <div>
              <dt>Renewed itself</dt>
              <dd>
                {s.renewals} {s.renewals === 1 ? "time" : "times"} <span className="muted">· {s.phase}</span>
              </dd>
            </div>
          </>
        )}
        {poolLeft && (
          <div>
            <dt>Still in {n.pool!.id.split(".")[0]}</dt>
            <dd>
              {fmt(n.pool!.stakedYocto)} staked · {fmt(n.pool!.unstakedYocto)} unstaked{" "}
              <span className="muted">{BigInt(n.pool!.unstakedYocto) > 0n ? (n.pool!.available ? "(ready to withdraw)" : "(unlocks ~4 epochs after unstaking)") : ""}</span>
            </dd>
          </div>
        )}
      </dl>
      <p className="small">
        <a href={`/api/nft/${n.name}.png`} target="_blank" rel="noreferrer">
          Live NFT card <ArrowUpRight aria-hidden="true" />
        </a>
        {" · "}
        <a href={shareOnX(n.name)} target="_blank" rel="noreferrer">
          Share on X <ArrowUpRight aria-hidden="true" />
        </a>
      </p>

      {readOnly ? null : n.evergreen ? (
        <div className="actions">
          <button type="button" className="chip" onClick={() => toggle("tip")}>Add to Stake</button>
          <button type="button" className="chip" onClick={() => act(`Poke ${n.name}`, [pokeTx(n.stewardId)])}>Poke</button>
          <button type="button" className="chip" onClick={() => toggle("exit")}>Take it back</button>
          <a className="chip" href={explorerAccount(n.stewardId)} target="_blank" rel="noreferrer">
            Steward <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      ) : (
        <div className="actions">
          {!n.pool && (
            <button type="button" className="chip chip-primary" onClick={() => toggle("adopt")}>
              Make it Evergreen
            </button>
          )}
          {n.pool && BigInt(n.pool.stakedYocto) >= BigInt(0) && (
            <button type="button" className="chip" onClick={() => toggle("handback")}>Hand back to its Steward</button>
          )}
          <button type="button" className="chip" onClick={() => toggle("renew")}>Renew now</button>
          <button type="button" className="chip" onClick={() => toggle("withdraw")}>Withdraw NEAR</button>
          <button type="button" className="chip" onClick={() => toggle("transfer")}>Transfer Name</button>
          {poolLeft && BigInt(n.pool!.stakedYocto) > 0n && (
            <button type="button" className="chip" onClick={() => act(`Unstake ${n.name}`, [unstakeAllTx(n.name, n.pool!.id)])}>Unstake all</button>
          )}
          {poolLeft && BigInt(n.pool!.unstakedYocto) > 0n && (
            <button type="button" className="chip" disabled={!n.pool!.available} onClick={() => act(`Withdraw from pool`, [withdrawFromPoolTx(n.name, n.pool!.id, BigInt(n.pool!.unstakedYocto))])}>
              Withdraw from pool
            </button>
          )}
        </div>
      )}

      {open === "adopt" && <Adopt n={n} me={me} act={act} />}
      {open === "tip" && (
        <AmountForm
          hint="Lands on the Name and is staked as principal. Anyone can do this for any Evergreen Name (a Lifeline)."
          cta="Add to Stake"
          onSubmit={(y) => act(`Add ${fmt(y)} NEAR to ${n.name}`, [tipTx(n.stewardId, y)])}
        />
      )}
      {open === "exit" && (
        <Confirm
          text="The Name comes back to you with everything on it: its plain NEAR (withdraw it here) and its Stake, still in the pool (unstake, then withdraw). Auto-renewal stops until you hand it back."
          cta="Take it back"
          onConfirm={() => act(`Take back ${n.name}`, [exitTx(n.stewardId)])}
        />
      )}
      {open === "handback" && (
        <Confirm
          text={`Gives the Name back to its Steward (${n.stewardId}) so it renews itself again from what is still staked. Any plain NEAR on the Name comes to you first.`}
          cta="Hand it back"
          onConfirm={() => act(`Hand ${n.name} back`, [transferNameTx(NET.registryId, n.name, n.stewardId)])}
        />
      )}
      {open === "renew" && <RenewForm n={n} act={act} />}
      {open === "withdraw" && (
        <AmountForm
          hint={`Sends plain NEAR from the Name to ${me}. Up to ${fmt(withdrawable > 0n ? withdrawable : 0n)} NEAR (the Name keeps a small reserve).`}
          cta="Withdraw"
          max={withdrawable > 0n ? withdrawable : 0n}
          onSubmit={(y) => act(`Withdraw ${fmt(y)} NEAR`, [withdrawFromNameTx(n.name, me, y)])}
        />
      )}
      {open === "transfer" && <TransferForm n={n} act={act} />}
    </article>
  );
}

function Adopt({ n, me, act }: { n: NameView; me: string; act: Act }) {
  const [stake, setStake] = useState("3");
  const [rent, setRent] = useState<string>();
  useEffect(() => {
    priceOf(n.name).then((p) => setRent(p.rentYocto)).catch(() => {});
  }, [n.name]);
  const y = parseNear(stake);
  const yearly = y ? Number(stake) * YIELD : 0;
  const rentNear = rent ? Number(BigInt(rent) / 10n ** 16n) / 1e8 : 0;
  const total = (y ? Number(stake) : 0) + STEWARD_BALANCE + NAME_BUFFER;
  const txs = useMemo(
    () =>
      y &&
      adoptTxs({
        registryId: NET.registryId,
        name: n.name,
        patron: me,
        pool: NET.pool,
        stakeYocto: y,
        windowSecs: NET.windowSecs,
        lapseGuardSecs: NET.lapseGuardSecs,
        code: { globalAccountId: NET.stewardCode },
      }),
    [y, n.name, me],
  );
  return (
    <div className="panel">
      <h3>2. Make it Evergreen</h3>
      <p className="small">
        A Steward of your own (<code>{stewardIdFor(n.name, me)}</code>) takes the Name and stakes NEAR on it with{" "}
        <code>{NET.pool}</code>. When Rent is due it pays it from the rewards only. Your principal is never spent; rewards above
        Rent stay staked and are yours.
      </p>
      <label className="field">
        <span>Stake</span>
        <input inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
        <span className="muted">NEAR</span>
      </label>
      <dl className="estimate">
        <div>
          <dt>Rewards a year (≈5%)</dt>
          <dd>{yearly.toFixed(4)} NEAR</dd>
        </div>
        <div>
          <dt>Rent a year</dt>
          <dd>{rentNear.toFixed(6)} NEAR</dd>
        </div>
        <div>
          <dt>Left over, staked and yours</dt>
          <dd className={yearly >= rentNear ? "ok" : "warn"}>{(yearly - rentNear).toFixed(4)} NEAR</dd>
        </div>
        <div>
          <dt>You send now</dt>
          <dd>
            {total.toFixed(2)} NEAR <span className="muted">= stake + {STEWARD_BALANCE} Steward storage + {NAME_BUFFER} left on the Name</span>
          </dd>
        </div>
      </dl>
      {yearly < rentNear && <p className="small warn">Rewards would not cover Rent: stake more, or the Steward pulls the Stake to safety before expiry.</p>}
      <p className="small">You approve 2 transactions: create your Steward holding the Stake, then send it your NFT (NEP-171 <code>nft_transfer_call</code>). The moment it arrives, the Steward moves the Stake onto the Name and stakes it.</p>
      <button type="button" className="btn" disabled={!txs} onClick={() => txs && act(`Make ${n.name} Evergreen`, txs)}>
        Make it Evergreen
      </button>
    </div>
  );
}

function RenewForm({ n, act }: { n: NameView; act: Act }) {
  const [rent, setRent] = useState<string>();
  useEffect(() => {
    priceOf(n.name).then((p) => setRent(p.rentYocto)).catch(() => {});
  }, [n.name]);
  return (
    <Confirm
      text={`Pays one more year of Rent now (${rent ? fmt(rent, 6) : "…"} NEAR) straight to the registry. Anyone can do this for any Name.`}
      cta="Pay Rent"
      disabled={!rent}
      onConfirm={() => act(`Renew ${n.name}`, [renewTx(NET.registryId, n.name, BigInt(rent!))])}
    />
  );
}

function TransferForm({ n, act }: { n: NameView; act: Act }) {
  const [to, setTo] = useState("");
  const ok = /^[a-z0-9_.-]{2,64}$/.test(to.trim());
  return (
    <div className="panel">
      <p className="small">The Name (and anything staked by it) goes to the new owner. Its plain NEAR comes to you first. This cannot be undone by you.</p>
      <label className="field">
        <span>New owner</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="friend.testnet" spellCheck={false} autoCapitalize="off" />
      </label>
      <button type="button" className="btn" disabled={!ok} onClick={() => act(`Transfer ${n.name}`, [transferNameTx(NET.registryId, n.name, to.trim())])}>
        Transfer
      </button>
    </div>
  );
}

function AmountForm({ hint, cta, max, onSubmit }: { hint: string; cta: string; max?: bigint; onSubmit(y: bigint): void }) {
  const [v, setV] = useState("");
  const y = parseNear(v);
  const tooMuch = y !== undefined && max !== undefined && y > max;
  return (
    <div className="panel">
      <p className="small">{hint}</p>
      <label className="field">
        <span>Amount</span>
        <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="1" />
        <span className="muted">NEAR</span>
      </label>
      {tooMuch && <p className="small warn">More than is available.</p>}
      <button type="button" className="btn" disabled={!y || tooMuch} onClick={() => y && onSubmit(y)}>
        {cta}
      </button>
    </div>
  );
}

function Confirm({ text, cta, disabled, onConfirm }: { text: ReactNode; cta: string; disabled?: boolean; onConfirm(): void }) {
  return (
    <div className="panel">
      <p className="small">{text}</p>
      <button type="button" className="btn" disabled={disabled} onClick={onConfirm}>
        {cta}
      </button>
    </div>
  );
}
