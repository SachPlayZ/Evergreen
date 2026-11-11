/**
 * A Name drawn as a willow made of dots. Each strand hangs from the canopy and
 * its length is the share of the Lease that is left: full in a fresh Lease,
 * bare at expiry.
 */
const COLS = 25;
const ROWS = 20;
const GAP = 10;
const MID = (COLS - 1) / 2;

/** Stable per-strand variation so the canopy looks hand-cut, not computed. */
function jitter(col: number): number {
  const x = Math.sin(col * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export type WillowState = "active" | "grace" | "reclaimable" | "suspended" | "not_rented";

export function Willow({ health, state, size = 280 }: { health: number; state: WillowState; size?: number }) {
  const alive = state === "active" || state === "grace";
  const h = alive ? Math.max(0, Math.min(1, health)) : 0;
  const dots: { cx: number; cy: number; lit: boolean; row: number; col: number }[] = [];
  for (let col = 0; col < COLS; col++) {
    const x = (col - MID) / (MID + 0.5);
    const full = Math.round(ROWS * Math.sqrt(1 - x * x) * (0.72 + 0.28 * jitter(col)));
    const lit = Math.round(full * h);
    for (let row = 0; row < full; row++) {
      dots.push({ cx: col * GAP + 6, cy: row * GAP + 6, lit: row < lit, row, col });
    }
  }
  const trunk: { cx: number; cy: number }[] = [];
  for (let row = 3; row < ROWS + 4; row++) {
    for (const col of row > ROWS ? [MID - 2, MID - 1, MID, MID + 1, MID + 2] : [MID - 1, MID, MID + 1]) {
      trunk.push({ cx: col * GAP + 6, cy: row * GAP + 6 });
    }
  }
  const width = COLS * GAP + 2;
  const height = (ROWS + 5) * GAP + 2;
  return (
    <svg
      className={`willow willow-${state}`}
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={(size * height) / width}
      role="img"
      aria-label={`${Math.round(h * 100)}% of the Lease left`}
    >
      {trunk.map((d, i) => (
        <circle key={`t${i}`} className="willow-trunk" cx={d.cx} cy={d.cy} r={3.4} />
      ))}
      {Array.from({ length: COLS }, (_, col) => (
        <g key={col} className="sway" style={{ animationDelay: `${-(jitter(col + 7) * 5).toFixed(2)}s` }}>
          {dots
            .filter((d) => d.col === col)
            .map((d) => (
              <circle
                key={d.row}
                className={d.lit ? `willow-leaf willow-leaf-${(d.row + d.col) % 3}` : "willow-bare"}
                cx={d.cx}
                cy={d.cy}
                r={d.lit ? 3.6 : 1.1}
                style={{ transitionDelay: `${(d.row * 14 + (d.col % 5) * 9) % 320}ms` }}
              />
            ))}
        </g>
      ))}
      {Array.from({ length: COLS }, (_, col) => (
        <circle key={`g${col}`} className="willow-ground" cx={col * GAP + 6} cy={(ROWS + 4) * GAP + 6} r={1.6} />
      ))}
    </svg>
  );
}

/** A tiny strand for the mainnet forest: one Name, length = share of its year left. */
export function Strand({ share, title }: { share: number; title: string }) {
  const n = 12;
  const lit = Math.max(0, Math.round(n * Math.min(1, share)));
  return (
    <svg className="strand" viewBox={`0 0 8 ${n * 7}`} width={8} height={n * 7}>
      <title>{title}</title>
      {Array.from({ length: n }, (_, i) => (
        <circle key={i} cx={4} cy={i * 7 + 4} r={i < lit ? 2.6 : 0.9} className={i < lit ? "strand-lit" : "strand-bare"} />
      ))}
    </svg>
  );
}
