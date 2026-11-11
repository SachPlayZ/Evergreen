"use client";

import { Check, Copy, Warning } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { STATUS, near, phaseText, timeLeft, type NameJson } from "@/lib/format";
import { useLive, useSecondsLeft } from "./LiveData";
import { Reveal } from "./Motion";
import { Willow } from "./Willow";

function Command({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <button
      type="button"
      className="command"
      onClick={() => navigator.clipboard.writeText(text).then(() => setCopied(true))}
      aria-label={`Copy command: ${text}`}
    >
      <code>{text}</code>
      <span className={`command-icon ${copied ? "is-done" : ""}`}>
        {copied ? <Check weight="bold" aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </span>
      <span className="sr" role="status">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

function Name({ item, termSecs }: { item: NameJson; termSecs: number }) {
  const { lease, steward, warnings } = item;
  const seconds = useSecondsLeft(lease.secondsLeft);
  const renewals = steward?.renewals.length ?? 0;
  const seen = useRef(renewals);
  const [flights, setFlights] = useState(0);
  useEffect(() => {
    if (renewals > seen.current) setFlights((f) => f + 1);
    seen.current = renewals;
  }, [renewals]);

  const toRent = steward
    ? Math.min(1, Number((BigInt(steward.rewardsYocto) * 1000n) / (BigInt(steward.rentYocto) || 1n)) / 1000)
    : 0;
  const last = steward?.renewals.at(-1);
  return (
    <article className={`name is-${lease.status}`}>
      <div className="name-art">
        <Willow health={seconds / termSecs} state={lease.status} size={300} />
        {flights > 0 && (
          // a renewal: a moth leaves the tree
          // eslint-disable-next-line @next/next/no-img-element
          <img key={flights} className="flight" src="/art/moth-5.webp" alt="" aria-hidden="true" />
        )}
      </div>
      <h3 className="mono">{lease.name}</h3>
      <p className="name-time num" aria-live="off">
        {lease.status === "active" ? timeLeft(seconds) : lease.status === "grace" ? "Expired" : "Gone"}
      </p>
      <p className="name-sub">
        {lease.status === "active"
          ? "left on this Lease"
          : lease.status === "grace"
            ? "In Grace. Paying its Rent still saves it."
            : `${STATUS[lease.status]}. Anyone can take this Name now.`}
      </p>

      {steward ? (
        <>
          <p className="name-phase">{phaseText(steward.phase)}</p>
          <div className="gauge" role="img" aria-label={`Rewards cover ${Math.round(toRent * 100)}% of the next Rent`}>
            <span style={{ transform: `scaleX(${toRent})` }} />
          </div>
          <p className="small">
            <span className="num">{near(steward.rewardsYocto)}</span> of <span className="num">{near(steward.rentYocto)}</span>{" "}
            NEAR saved toward the next Rent
          </p>
          <dl className="facts">
            <div>
              <dt>Renewed itself</dt>
              <dd className="num" key={renewals}>
                {renewals}
              </dd>
            </div>
            <div>
              <dt>Staked</dt>
              <dd className="num">{near(steward.stakedYocto)}</dd>
            </div>
            <div>
              <dt>Principal</dt>
              <dd className="num">{near(steward.principalYocto)}</dd>
            </div>
          </dl>
          {last && (
            <p className="small">
              Last renewal paid <span className="num">{near(last.rentYocto)}</span> NEAR, all of it from rewards.
            </p>
          )}
        </>
      ) : (
        <p className="name-phase">Nothing renews this Name. Its owner has to remember.</p>
      )}
      {warnings.map((w) => (
        <p key={w.code} className="warning">
          <Warning weight="bold" aria-hidden="true" />
          {w.message}
        </p>
      ))}
    </article>
  );
}

function Skeleton() {
  return (
    <div className="names" aria-busy="true" aria-label="Reading the chain">
      {[0, 1].map((i) => (
        <div key={i} className="name">
          <div className="skeleton" style={{ width: 300, maxWidth: "100%", aspectRatio: "252 / 252", borderRadius: 12 }} />
          <p className="skeleton skeleton-line" style={{ width: 120, marginTop: 24 }} />
          <p className="skeleton skeleton-line" style={{ width: 200, height: 72 }} />
          <p className="skeleton skeleton-line" style={{ width: 260 }} />
        </div>
      ))}
    </div>
  );
}

export function LiveNames() {
  const { demo } = useLive();
  const names = demo?.names;
  const atRisk = names?.filter((n) => n.lease.status === "grace" || n.warnings.some((w) => w.code === "EXPIRES_SOON")) ?? [];
  return (
    <section className="live" id="live">
      <Reveal>
        <h2>
          Two Names. One <em>looks after itself.</em>
        </h2>
        <p className="section-lede">
          {names
            ? `Read from the ${demo.label} every two seconds. Here a Lease lasts ${demo.termSecs} seconds instead of a year, so you can watch one run out.`
            : "A real Steward, on a network where a Lease lasts a minute instead of a year."}
        </p>
      </Reveal>

      {!demo ? (
        <Skeleton />
      ) : !names ? (
        <Reveal className="empty">
          <p>No demo network is running. Start one in two terminals and this section comes alive.</p>
          <Command text="pnpm evergreen sandbox --story" />
          <Command text="pnpm evergreen keeper run" />
        </Reveal>
      ) : (
        <>
          <div className="names">
            {[...names.filter((n) => n.steward), ...names.filter((n) => !n.steward)].map((item, i) => (
              <Reveal key={item.lease.name} delay={i * 0.1}>
                <Name item={item} termSecs={demo.termSecs ?? 60} />
              </Reveal>
            ))}
          </div>
          {atRisk.length > 0 && (
            <div className="lifeline" id="icu">
              <h3>Throw a Lifeline</h3>
              <p className="small">Anyone can pay any Name&apos;s Rent. The registry accepts a renewal from any account.</p>
              {atRisk.map(({ lease }) => (
                <Command key={lease.name} text={`pnpm evergreen renew ${lease.name} --as fan`} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
