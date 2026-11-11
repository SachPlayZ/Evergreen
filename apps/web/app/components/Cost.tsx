"use client";

import { useState } from "react";
import { Num, Reveal } from "./Motion";

const TIERS = [
  { label: "12+", rent: 7.5 },
  { label: "9 to 10", rent: 15 },
  { label: "6 to 8", rent: 30 },
  { label: "5 or fewer", rent: 75 },
];
const YIELD = 0.05;
const usd = (n: number) => `$${n.toFixed(n % 1 ? 2 : 0)}`;
const usd2 = (n: number) => `$${n.toFixed(2)}`;

export function Cost() {
  const [pick, setPick] = useState(0);
  const tier = TIERS[pick];
  return (
    <section className="cost" id="cost">
      <Reveal>
        <h2>
          What it costs, and what you <em>keep.</em>
        </h2>
        <div className="segments" role="radiogroup" aria-label="Characters in the name">
          {TIERS.map((t, i) => (
            <button key={t.label} type="button" role="radio" aria-checked={i === pick} onClick={() => setPick(i)}>
              {t.label}
            </button>
          ))}
          <span className="segments-unit">characters</span>
        </div>
        <div className="cost-figures">
          <div>
            <p className="stat cost-stake">
              <Num value={tier.rent / YIELD} format={usd} />
            </p>
            <p className="small">Staked once. It stays yours.</p>
          </div>
          <div>
            <p className="stat">
              <Num value={tier.rent} format={usd2} />
            </p>
            <p className="small">Rent each year, paid by the rewards at 5% yield.</p>
          </div>
        </div>
        <p className="fine">
          Rent shown for an Open Standard Namespace at the registry&apos;s default prices. The Top Level Accounts registry
          and wallet are third-party, audited and unmodified (houseofstake/tla-contracts at d85860a). The Steward is new
          and unaudited.
        </p>
      </Reveal>
    </section>
  );
}
