"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Halftone, type HalftoneState } from "./Halftone";

const STEPS: { title: string; text: string; look: HalftoneState }[] = [
  {
    title: "Hand it over",
    text: "You transfer your Name to a Steward contract made for it. You stay its Patron and can take the Name back at any time.",
    look: { grow: 1, bright: 0, pulse: 0, sink: 0 },
  },
  {
    title: "Stake once",
    text: "The Name stakes its own NEAR in a staking pool. Tips from anyone are added to the Stake.",
    look: { grow: 1, bright: 1, pulse: 0, sink: 0 },
  },
  {
    title: "Anyone can poke it",
    text: "Near expiry, anyone can poke the Steward. It takes exactly the next Rent out of the rewards and pays the registry's open renewal.",
    look: { grow: 1, bright: 1, pulse: 1, sink: 0 },
  },
  {
    title: "Never left stranded",
    text: "If rewards fall short, it pulls the whole Stake back onto the Name before expiry. Stake left in a pool would pass to whoever rents the Name next.",
    look: { grow: 1, bright: 0.35, pulse: 0, sink: 1 },
  },
];

function Step({ index, active, onActive }: { index: number; active: boolean; onActive: (i: number) => void }) {
  const ref = useRef<HTMLLIElement>(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);
  return (
    <li ref={ref} className={`step ${active ? "is-active" : ""}`}>
      <h3>{STEPS[index].title}</h3>
      <p>{STEPS[index].text}</p>
    </li>
  );
}

/** The four steps scroll past while the willow, redrawn in dots, acts each one out. */
export function HowScroll() {
  const [active, setActive] = useState(0);
  const look = useRef<HalftoneState>({ grow: 0, bright: 0, pulse: 0, sink: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const seen = useInView(stage, { once: true, margin: "-20% 0px" });
  useEffect(() => {
    look.current = seen ? STEPS[active].look : { grow: 0, bright: 0, pulse: 0, sink: 0 };
  }, [active, seen]);

  return (
    <section className="how" id="how">
      <h2>
        Stake once. The rewards pay the Rent, <em>every year.</em>
      </h2>
      <div className="how-grid">
        <div className="how-stage" ref={stage}>
          <Halftone src="/art/willow.webp" state={look} className="how-canvas" />
        </div>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <Step key={step.title} index={i} active={i === active} onActive={setActive} />
          ))}
        </ol>
      </div>
    </section>
  );
}
