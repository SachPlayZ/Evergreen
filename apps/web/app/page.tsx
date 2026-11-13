import { Cost } from "./components/Cost";
import { Hero } from "./components/Hero";
import { HowScroll } from "./components/HowScroll";
import { Lapse } from "./components/Lapse";
import { LiveProvider } from "./components/LiveData";
import { LiveNames } from "./components/LiveNames";
import { Parallax, SmoothScroll } from "./components/Motion";
import { UseIt } from "./components/UseIt";
import Link from "next/link";

const REPO = "https://github.com/SachPlayZ/Evergreen";

/** Moths rising through the night at the foot of the page. Position is % of the footer. */
const NIGHT = [
  { n: 5, left: "6%", top: "58%", size: 190, drift: 30 },
  { n: 3, left: "24%", top: "22%", size: 120, drift: 70 },
  { n: 4, left: "68%", top: "50%", size: 170, drift: 45 },
  { n: 2, left: "84%", top: "12%", size: 96, drift: 90 },
  { n: 1, left: "47%", top: "8%", size: 64, drift: 110 },
];

export default function Home() {
  return (
    <LiveProvider>
      <SmoothScroll />
      <nav className="nav" aria-label="Main">
        <a className="wordmark" href="#top">
          Evergreen
        </a>
        <div className="nav-links">
          <a href="#live">Live</a>
          <a href="#how">How it works</a>
          <a href="#mainnet">Mainnet</a>
          <a href="#cost">Cost</a>
          <a href="#use">Use it</a>
          <Link className="nav-cta" href="/app">
            Open app
          </Link>
          <a href={REPO}>GitHub</a>
        </div>
      </nav>

      <div id="top" />
      <Hero />
      <main>
        <LiveNames />
        <HowScroll />
        <Lapse />
        <Cost />
        <UseIt />
      </main>

      <footer className="foot">
        {NIGHT.map((m) => (
          <Parallax key={m.n} amount={m.drift} className="foot-moth">
            <span className="moth" style={{ left: m.left, top: m.top, width: m.size, animationDuration: `${18 + m.n * 2}s`, animationDelay: `${-m.n * 3}s` }} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/art/moth-${m.n}.webp`} alt="" loading="lazy" style={{ animationDelay: `${-m.n * 0.07}s` }} />
            </span>
          </Parallax>
        ))}
        <p className="foot-big">
          Stay <em>green.</em>
        </p>
        <p className="fine">
          Evergreen. Built for the NEAR Hackathon, November 2026. MIT licence. <a href={REPO}>Source on GitHub</a> · verify
          with <code>pnpm demo</code> · <a href="/llms.txt">llms.txt</a>
        </p>
      </footer>
    </LiveProvider>
  );
}
