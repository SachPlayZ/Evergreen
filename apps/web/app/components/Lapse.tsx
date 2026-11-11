"use client";

import { ArrowClockwise } from "@phosphor-icons/react";
import { motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { shortDate, timeLeft } from "@/lib/format";
import { Halftone, type HalftoneState } from "./Halftone";
import { useLive } from "./LiveData";
import { Num, Reveal } from "./Motion";
import { Strand } from "./Willow";

/** The thing waiting for a Lease to lapse. It comes out of the dark as dots, then as paint. */
function Cat() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const look = useRef<HalftoneState>({ grow: reduce ? 1 : 0, bright: 1, pulse: 0, sink: 0 });
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "center 45%"] });
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    look.current.grow = reduce ? 1 : Math.min(1, p * 1.6);
  });
  const paint = useTransform(scrollYProgress, [0.55, 1], reduce ? [1, 1] : [0, 1]);
  const dots = useTransform(scrollYProgress, [0.7, 1], reduce ? [0, 0] : [1, 0]);
  return (
    <div ref={ref} className="cat" role="img" aria-label="A painted green cat with spiral eyes, watching">
      <motion.div className="cat-layer" style={{ opacity: dots }}>
        <Halftone src="/art/cat.webp" state={look} gap={8} className="cat-canvas" />
      </motion.div>
      <motion.img className="cat-layer" src="/art/cat.webp" alt="" loading="lazy" style={{ opacity: paint }} />
    </div>
  );
}

function Census() {
  const { mainnet, mainnetFailed, retryMainnet } = useLive();
  if (mainnetFailed) {
    return (
      <div className="empty">
        <p>Could not read NEAR mainnet just now.</p>
        <button type="button" className="link" onClick={retryMainnet}>
          <ArrowClockwise weight="bold" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }
  if (!mainnet) {
    return (
      <div aria-busy="true" aria-label="Reading NEAR mainnet">
        <div className="stats">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <p className="skeleton skeleton-line" style={{ width: 120, height: 56 }} />
              <p className="skeleton skeleton-line" style={{ width: 160 }} />
            </div>
          ))}
        </div>
        <div className="skeleton" style={{ height: 120, borderRadius: 12, marginTop: 40 }} />
      </div>
    );
  }
  const year = 365 * 86400;
  const first = mainnet.names.find((n) => n.secondsLeft > 0);
  return (
    <>
      <Reveal className="stats">
        <div>
          <p className="stat">
            <Num value={mainnet.nameCount} />
          </p>
          <p className="small">Names rented on mainnet</p>
        </div>
        <div>
          <p className="stat">
            <Num value={mainnet.namespaces} />
          </p>
          <p className="small">Namespaces</p>
        </div>
        <div>
          <p className="stat num">{first ? shortDate(first.expiresAtMs) : "n/a"}</p>
          <p className="small">The first Lease runs out</p>
        </div>
      </Reveal>
      <Reveal className="forest" delay={0.1}>
        {mainnet.names.map((n, i) => (
          <span key={n.name} className="strand-wrap" style={{ animationDelay: `${i * 14}ms` }}>
            <Strand share={n.secondsLeft / year} title={`${n.name}: ${timeLeft(n.secondsLeft)} left`} />
          </span>
        ))}
      </Reveal>
      <p className="small">
        One strand for each real Name in <span className="mono">{mainnet.registryId}</span>. Its length is the share of the
        year it has left.
      </p>
      <Reveal>
        <h3 className="soon-title">Running out first</h3>
        <ul className="soon">
          {mainnet.names.slice(0, 5).map((n) => (
            <li key={n.name}>
              <span className="mono">{n.name}</span>
              <span className="soon-owner mono">{n.owner}</span>
              <span className="num">{shortDate(n.expiresAtMs)}</span>
              <span className="num soon-left">{timeLeft(n.secondsLeft)}</span>
            </li>
          ))}
        </ul>
      </Reveal>
    </>
  );
}

export function Lapse() {
  return (
    <section className="lapse" id="mainnet">
      <div className="lapse-top">
        <Reveal className="lapse-copy">
          <h2>
            Miss one renewal and <em>anyone</em> can take it.
          </h2>
          <p className="section-lede">
            A name like <span className="mono">alice.bot</span> is an NFT and a real account, leased for a year. After 14
            days of Grace it is Reclaimable, along with any stake still sitting in a pool.
          </p>
        </Reveal>
        <Cat />
      </div>
      <Census />
    </section>
  );
}
