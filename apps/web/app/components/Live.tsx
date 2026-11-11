"use client";

import { useEffect, useRef, useState } from "react";
import { CountUp, Reveal, Tilt } from "./Motion";
import { Strand, Willow, type WillowState } from "./Willow";

interface LeaseJson {
  name: string;
  owner: string;
  status: WillowState;
  secondsLeft: number;
}
interface StewardJson {
  stewardId: string;
  patron: string;
  principalYocto: string;
  tipsYocto: string;
  tipCount: number;
  stakedYocto: string;
  rewardsYocto: string;
  rentYocto: string;
  phase: string | Record<string, unknown>;
  renewals: { atNs: string; newExpiresNs: string; rentYocto: string }[];
}
interface NameJson {
  lease: LeaseJson;
  steward?: StewardJson;
  warnings: { code: string; message: string }[];
}
interface DemoJson {
  configured: boolean;
  label?: string;
  termSecs?: number;
  names?: NameJson[];
}
interface MainnetJson {
  registryId: string;
  namespaces: number;
  nameCount: number;
  nearUsd: number;
  names: { name: string; owner: string; status: string; secondsLeft: number; expiresAtMs: number }[];
  error?: string;
}

const near = (yocto: string, digits = 2) => (Number(BigInt(yocto) / 10n ** 18n) / 1e6).toFixed(digits);

function timeLeft(seconds: number): string {
  if (seconds <= 0) return "expired";
  if (seconds < 120) return `${seconds}s`;
  if (seconds < 7200) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}

const PHASE: Record<string, string> = {
  Idle: "Resting. Stake is earning.",
  Unstaking: "Pulling next Rent out of its rewards.",
  Withdrawing: "Moving the Rent onto the Name.",
  Renewing: "Paying its own Rent.",
  Evacuated: "Stake pulled to safety. Needs a Lifeline.",
};
const phaseKey = (phase: StewardJson["phase"]) => (typeof phase === "string" ? phase : Object.keys(phase)[0]);

const STATUS: Record<string, string> = {
  active: "Active",
  grace: "In Grace",
  reclaimable: "Reclaimable",
  suspended: "Suspended",
  not_rented: "Not rented",
};

function NameCard({ item, termSecs }: { item: NameJson; termSecs: number }) {
  const { lease, steward, warnings } = item;
  const health = lease.secondsLeft / termSecs;
  const toRent = steward ? Math.min(1, Number(BigInt(steward.rewardsYocto) * 1000n / (BigInt(steward.rentYocto) || 1n)) / 1000) : 0;
  const renewals = steward?.renewals.length ?? 0;
  const seen = useRef(renewals);
  const [burst, setBurst] = useState(0);
  useEffect(() => {
    if (renewals > seen.current) setBurst((b) => b + 1);
    seen.current = renewals;
  }, [renewals]);
  const urgent = lease.status === "active" && lease.secondsLeft <= termSecs / 4;
  return (
    <Tilt className={`card card-${lease.status} ${steward ? "card-evergreen" : "card-plain"} ${urgent ? "card-urgent" : ""}`}>
      {burst > 0 && <span key={burst} className="burst" aria-hidden="true" />}
      <header className="card-head">
        <h3 className="card-name">{lease.name}</h3>
        <span className="chip">{steward ? "Evergreen" : "No Steward"}</span>
      </header>
      <div className="card-body">
        <div className="card-art">
          <Willow health={health} state={lease.status} />
        </div>
        <div className="card-facts">
          <p className="card-status">{STATUS[lease.status]}</p>
          <p className="card-time" key={lease.status === "active" ? "t" : lease.status}>
            {lease.status === "active" ? timeLeft(lease.secondsLeft) : lease.status === "grace" ? "expired" : "gone"}
          </p>
          <p className="card-sub">
            {lease.status === "active"
              ? "left on this Lease"
              : lease.status === "grace"
                ? "can still be saved by paying its Rent"
                : "anyone can take this Name now"}
          </p>
          {steward ? (
            <>
              <dl className="facts">
                <div>
                  <dt>Staked</dt>
                  <dd>{near(steward.stakedYocto)} NEAR</dd>
                </div>
                <div>
                  <dt>Principal</dt>
                  <dd>{near(steward.principalYocto)} NEAR</dd>
                </div>
                <div>
                  <dt>Self-renewals</dt>
                  <dd>{steward.renewals.length}</dd>
                </div>
                <div>
                  <dt>Tips</dt>
                  <dd>
                    {steward.tipCount} ({near(steward.tipsYocto)} NEAR)
                  </dd>
                </div>
              </dl>
              <div className="meter" aria-label="Rewards saved toward next Rent">
                <div className="meter-fill" style={{ width: `${toRent * 100}%` }} />
              </div>
              <p className="meter-label">
                Rewards toward next Rent: {near(steward.rewardsYocto)} of {near(steward.rentYocto)} NEAR
              </p>
              <p className="phase">{PHASE[phaseKey(steward.phase)] ?? phaseKey(steward.phase)}</p>
            </>
          ) : (
            <p className="phase">Nothing renews this Name. Its owner has to remember.</p>
          )}
          {warnings.length > 0 && (
            <ul className="warnings">
              {warnings.map((w) => (
                <li key={w.code}>
                  <code>{w.code}</code> {w.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {steward && steward.renewals.length > 0 && (
        <footer className="timeline">
          {steward.renewals.length > 3 && <span className="tick tick-more">{steward.renewals.length - 3} earlier</span>}
          {steward.renewals.slice(-3).map((r, i) => (
            <span key={r.atNs} className="tick">
              renewal {Math.max(0, steward.renewals.length - 3) + i + 1}: paid {near(r.rentYocto)} NEAR from rewards
            </span>
          ))}
        </footer>
      )}
    </Tilt>
  );
}

export function LiveDemo() {
  const [demo, setDemo] = useState<DemoJson | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/demo", { cache: "no-store" });
        if (!stop) setDemo(await res.json());
      } catch {
        if (!stop) setDemo({ configured: false });
      }
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  if (!demo) return <p className="note">Reading the chain…</p>;
  if (!demo.configured || !demo.names) {
    return (
      <div className="note">
        <p>No demo network is running. Start the live scene in two terminals:</p>
        <pre>pnpm evergreen sandbox --story{"\n"}pnpm evergreen keeper run</pre>
      </div>
    );
  }
  const evergreen = demo.names.filter((n) => n.steward);
  const plain = demo.names.filter((n) => !n.steward);
  const atRisk = demo.names.filter((n) => n.lease.status === "grace" || n.warnings.some((w) => w.code === "EXPIRES_SOON"));
  return (
    <>
      <p className="label-strip">
        Live from the {demo.label}. Demo settings: Leases and Grace last {demo.termSecs} seconds (real: 1 year and 14 days),
        and the demo pool pays rewards on demand (real pools: about 5% a year).
      </p>
      <div className="cards">
        {[...evergreen, ...plain].map((item, i) => (
          <Reveal key={item.lease.name} delay={i * 0.12}>
            <NameCard item={item} termSecs={demo.termSecs ?? 60} />
          </Reveal>
        ))}
      </div>
      <section className="icu" id="icu">
        <h2>
          ICU <span>Names that need a Lifeline</span>
        </h2>
        {atRisk.length === 0 ? (
          <p className="note">No Name is at risk right now.</p>
        ) : (
          <ul className="icu-list">
            {atRisk.map(({ lease, steward }) => (
              <li key={lease.name}>
                <strong>{lease.name}</strong>
                <span>{lease.status === "grace" ? "expired, in Grace" : `expires in ${timeLeft(lease.secondsLeft)}`}</span>
                <span>{steward ? "its Steward is on it" : "nobody is renewing it"}</span>
                <code>pnpm evergreen renew {lease.name} --as fan</code>
              </li>
            ))}
          </ul>
        )}
        <p className="fine">Anyone can pay any Name&apos;s Rent. The registry accepts renewal from any account.</p>
      </section>
    </>
  );
}

export function MainnetForest() {
  const [data, setData] = useState<MainnetJson | null>(null);
  useEffect(() => {
    fetch("/api/mainnet")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);
  if (!data || data.error || !data.names) return <p className="note">Reading NEAR mainnet…</p>;
  const year = 365 * 86400;
  const first = data.names.find((n) => n.secondsLeft > 0);
  const date = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <>
      <Reveal className="stats">
        <div>
          <b>
            <CountUp value={data.nameCount} />
          </b>
          <span>Names rented on mainnet</span>
        </div>
        <div>
          <b>
            <CountUp value={data.namespaces} />
          </b>
          <span>Namespaces</span>
        </div>
        <div>
          <b>{first ? date(first.expiresAtMs) : "n/a"}</b>
          <span>first Lease runs out</span>
        </div>
      </Reveal>
      <Reveal className="forest-wrap" delay={0.1}>
      <div className="forest" aria-label="Every Name on mainnet, by time left">
        {data.names.map((n, i) => (
          <span key={n.name} className="strand-wrap" style={{ animationDelay: `${i * 18}ms` }}>
            <Strand share={n.secondsLeft / year} title={`${n.name}: ${timeLeft(n.secondsLeft)} left`} />
          </span>
        ))}
      </div>
      </Reveal>
      <p className="fine">
        One strand per real Name, read live from <code>{data.registryId}</code>. Length is the share of its year left.
      </p>
      <table className="soon">
        <thead>
          <tr>
            <th>Running out first</th>
            <th>Owner</th>
            <th>Expires</th>
            <th>Left</th>
          </tr>
        </thead>
        <tbody>
          {data.names.slice(0, 8).map((n) => (
            <tr key={n.name}>
              <td>{n.name}</td>
              <td>{n.owner}</td>
              <td>{date(n.expiresAtMs)}</td>
              <td>{timeLeft(n.secondsLeft)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
