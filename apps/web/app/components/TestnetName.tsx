"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { near, phaseText, timeLeft, type StewardJson } from "@/lib/format";
import { Reveal } from "./Motion";

interface TestnetJson {
  error?: string;
  name: string;
  stewardId: string;
  pool: string;
  phase: StewardJson["phase"];
  stakedYocto: string;
  principalYocto: string;
  rewardsYocto: string;
  needYocto: string;
  renewals: number;
  secondsLeft: number;
  status: string;
}

const explorer = (id: string) => `https://testnet.nearblocks.io/address/${id}`;

/** The same Steward on NEAR testnet: a one-year Lease, staked with a real validator, read every 30 seconds. */
export function TestnetName() {
  const [data, setData] = useState<TestnetJson>();
  useEffect(() => {
    let stop = false;
    const read = () =>
      fetch("/api/testnet", { cache: "no-store" })
        .then((r) => r.json())
        .then((d: TestnetJson) => !stop && !d.error && setData(d))
        .catch(() => {});
    read();
    const poll = setInterval(read, 30_000);
    return () => {
      stop = true;
      clearInterval(poll);
    };
  }, []);
  if (!data) return null;

  const need = BigInt(data.needYocto);
  const share = need > 0n ? Math.min(1, Number((BigInt(data.rewardsYocto) * 1000n) / need) / 1000) : 0;
  return (
    <Reveal className="testnet">
      <h3>
        And one <em>for real</em>, on testnet.
      </h3>
      <p className="small">
        A one-year Lease, staked with a real validator. Rent here is a thousandth of a cent, so the first epoch of real
        rewards covers it; the pool holds unstaked NEAR for about two days, then the Steward renews with no one paying.
      </p>
      <dl className="testnet-stats">
        <div>
          <dt>Name</dt>
          <dd>
            <a href={explorer(data.name)} target="_blank" rel="noreferrer">
              <code>{data.name}</code> <ArrowUpRight aria-hidden="true" />
            </a>
          </dd>
        </div>
        <div>
          <dt>Lease</dt>
          <dd>{timeLeft(data.secondsLeft)} left</dd>
        </div>
        <div>
          <dt>Staked with {data.pool.split(".")[0]}</dt>
          <dd>
            {near(data.stakedYocto)} NEAR <span className="muted">(principal {near(data.principalYocto)})</span>
          </dd>
        </div>
        <div>
          <dt>Real rewards toward next Rent</dt>
          <dd>
            {near(data.rewardsYocto, 6)} of {near(data.needYocto, 6)} NEAR
            <span className="testnet-bar" aria-hidden="true">
              <span style={{ width: `${share * 100}%` }} />
            </span>
          </dd>
        </div>
        <div>
          <dt>Renewed itself</dt>
          <dd>
            {data.renewals} {data.renewals === 1 ? "time" : "times"} <span className="muted">· {phaseText(data.phase)}</span>
          </dd>
        </div>
        <div>
          <dt>Steward</dt>
          <dd>
            <a href={explorer(data.stewardId)} target="_blank" rel="noreferrer">
              <code>{data.stewardId}</code> <ArrowUpRight aria-hidden="true" />
            </a>
          </dd>
        </div>
      </dl>
    </Reveal>
  );
}
