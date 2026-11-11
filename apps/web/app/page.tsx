import { HeroScene } from "./components/HeroScene";
import { LiveDemo, MainnetForest } from "./components/Live";
import { Heading, Marquee, Parallax, Reveal, SmoothScroll, Words } from "./components/Motion";

const STAKE_ROWS = [
  { name: "12+ characters", rent: 7.5 },
  { name: "9 to 10 characters", rent: 15 },
  { name: "6 to 8 characters", rent: 30 },
  { name: "5 or fewer", rent: 75 },
];

const STEPS = [
  {
    title: "Hand over",
    text: "You transfer your Name to a Steward contract made for it. You stay its Patron and can take the Name back at any time.",
  },
  {
    title: "Stake once",
    text: "The Name stakes its own NEAR in a staking pool. Tips from anyone are added to the Stake.",
  },
  {
    title: "Anyone pokes",
    text: "Near expiry, anyone can poke the Steward. It takes exactly the next Rent out of the rewards and pays the registry's open renewal.",
  },
  {
    title: "Never stranded",
    text: "If rewards fall short, it pulls the whole Stake back onto the Name before expiry, because stake left in a pool passes to whoever rents the Name next.",
  },
];

const TICKER = [
  "Names expire",
  "Stake once",
  "Rent pays itself",
  "Principal never spent",
  "Anyone can throw a Lifeline",
  "An NFT that is an account",
  "Owned by code",
];

export default function Home() {
  return (
    <>
      <SmoothScroll />
      <div className="grain" aria-hidden="true" />
      <svg className="defs" aria-hidden="true">
        <filter id="brush" x="-5%" y="-30%" width="110%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.35" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="16" />
        </filter>
      </svg>

      <header className="hero">
        <HeroScene />
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-copy">
          <p className="kicker">Evergreen · NEAR Top Level Accounts</p>
          <h1>
            <Words text="NEAR names now expire." delay={0.15} />
            <em>
              <Words text="This one keeps itself alive." delay={0.75} />
            </em>
          </h1>
          <Reveal delay={1.3} y={20}>
            <p className="lede">
              A name like <code>alice.bot</code> is an NFT and a real account, leased for a year. Miss the renewal and
              anyone can take it. An Evergreen Name is owned by a small Steward contract: it stakes the Name&apos;s own
              NEAR and pays each year&apos;s Rent from the rewards. The principal is never spent.
            </p>
            <a className="cue" href="#live">
              Watch it happen <span>↓</span>
            </a>
          </Reveal>
        </div>
      </header>

      <Marquee items={TICKER} />

      <main>
        <section className="live" id="live">
          <Heading title="Watch" sub="one Name renew itself, one run out" />
          <LiveDemo />
        </section>

        <section className="mainnet" id="mainnet">
          <Heading title="Mainnet" sub="every real Name is on a clock" />
          <MainnetForest />
        </section>

        <section className="how" id="how">
          <Heading title="How" sub="it works, and what it costs" />
          <div className="steps">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 0.1} className="step">
                <Parallax amount={10 + i * 6}>
                  <b className="step-n">{i + 1}</b>
                </Parallax>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <table className="soon">
              <thead>
                <tr>
                  <th>Name length</th>
                  <th>Rent per year</th>
                  <th>Stake that pays it at 5% yield</th>
                </tr>
              </thead>
              <tbody>
                {STAKE_ROWS.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>${row.rent.toFixed(2)}</td>
                    <td>${(row.rent / 0.05).toFixed(0)}, kept by you</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="fine">
              Rent shown for an Open Standard Namespace at the registry&apos;s default prices. The Top Level Accounts
              registry and wallet are third-party, audited and unmodified (houseofstake/tla-contracts at d85860a). The
              Steward is new and unaudited.
            </p>
          </Reveal>
        </section>
      </main>

      <footer className="foot">
        <Parallax amount={40}>
          <p className="foot-big">Stay green.</p>
        </Parallax>
        <p className="fine">Evergreen · built for the NEAR Hackathon, November 2026 · MIT</p>
      </footer>
    </>
  );
}
