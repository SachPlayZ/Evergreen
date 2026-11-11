"use client";

import { ArrowDown } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { STATUS, shortDate, timeLeft } from "@/lib/format";
import { useLive, useSecondsLeft } from "./LiveData";
import { EASE } from "./Motion";
import { Willow } from "./Willow";
import { WillowScene } from "./WillowScene";

/** Luna moths that idle around the willow. Position is % of the scene frame. */
const MOTHS = [
  { n: 4, left: "-13%", top: "9%", size: 118, dur: 19, delay: -3 },
  { n: 2, left: "86%", top: "30%", size: 84, dur: 23, delay: -11 },
  { n: 1, left: "-9%", top: "46%", size: 56, dur: 17, delay: -6 },
];

function Line({ children, delay }: { children: React.ReactNode; delay: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="line">
      <motion.span
        initial={reduce ? false : { y: "105%" }}
        animate={{ y: 0 }}
        transition={{ duration: 1, delay, ease: EASE }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** The product, in the hero: one real Name and its clock. */
function HeroCard() {
  const { demo, mainnet, mainnetFailed } = useLive();
  const item = demo?.names?.find((n) => n.steward) ?? demo?.names?.[0];
  const seconds = useSecondsLeft(item?.lease.secondsLeft ?? 0);

  if (item) {
    const { lease, steward } = item;
    const term = demo?.termSecs ?? 60;
    const renewals = steward?.renewals.length ?? 0;
    return (
      <a className={`hero-card is-${lease.status}`} href="#live">
        <div className="hero-card-art">
          <Willow health={seconds / term} state={lease.status} size={92} />
        </div>
        <div className="hero-card-text">
          <p className="mono">{lease.name}</p>
          <p className="hero-card-time num">{lease.status === "active" ? timeLeft(seconds) : STATUS[lease.status]}</p>
          <p className="small">
            {steward ? `Renewed itself ${renewals} ${renewals === 1 ? "time" : "times"}` : "Nothing renews this Name"}
          </p>
        </div>
      </a>
    );
  }
  // No demo network: show the real Name on mainnet that runs out first.
  const first = demo && mainnet?.names.find((n) => n.secondsLeft > 0);
  if (first) {
    return (
      <a className="hero-card" href="#mainnet">
        <div className="hero-card-art">
          <Willow health={first.secondsLeft / (365 * 86400)} state="active" size={92} />
        </div>
        <div className="hero-card-text">
          <p className="mono">{first.name}</p>
          <p className="hero-card-time num">{timeLeft(first.secondsLeft)}</p>
          <p className="small">Lease ends {shortDate(first.expiresAtMs)}. Nothing renews it.</p>
        </div>
      </a>
    );
  }
  if (demo && mainnetFailed) return null;
  return (
    <div className="hero-card" aria-busy="true" aria-label="Reading the chain">
      <div className="hero-card-art skeleton" />
      <div className="hero-card-text">
        <p className="skeleton skeleton-line" style={{ width: 96 }} />
        <p className="skeleton skeleton-line" style={{ width: 132, height: 34 }} />
        <p className="skeleton skeleton-line" style={{ width: 160 }} />
      </div>
    </div>
  );
}

export function Hero() {
  const reduce = useReducedMotion();
  return (
    <header className="hero">
      <div className="hero-copy">
        <h1>
          <Line delay={0.1}>Names expire.</Line>
          <Line delay={0.22}>
            This one <em>renews itself.</em>
          </Line>
        </h1>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6, ease: EASE }}
        >
          <p className="lede">
            A Steward contract owns your NEAR name, stakes its NEAR, and pays each year&apos;s Rent from the rewards.
          </p>
          <div className="hero-actions">
            <a className="btn" href="#live">
              Watch it live
              <ArrowDown weight="bold" aria-hidden="true" />
            </a>
            <a className="link" href="#how">
              How it works
            </a>
          </div>
        </motion.div>
      </div>

      <div className="hero-art">
        <motion.div
          className="hero-frame"
          initial={reduce ? false : { clipPath: "inset(100% 0 0 0 round 20px)" }}
          animate={{ clipPath: "inset(0% 0 0 0 round 20px)" }}
          transition={{ duration: 1.3, delay: 0.15, ease: EASE }}
        >
          <WillowScene />
        </motion.div>
        {MOTHS.map((m) => (
          <span
            key={m.n}
            className="moth"
            style={{ left: m.left, top: m.top, width: m.size, animationDuration: `${m.dur}s`, animationDelay: `${m.delay}s` }}
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/art/moth-${m.n}.webp`} alt="" style={{ animationDelay: `${m.delay}s` }} />
          </span>
        ))}
        <motion.div
          className="hero-card-slot"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1, ease: EASE }}
        >
          <HeroCard />
        </motion.div>
      </div>
    </header>
  );
}
