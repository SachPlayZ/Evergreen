/**
 * A live card for one Name, the NFT: its willow drawn at the share of its Lease left, what it has staked,
 * what it has paid for itself, and who owns it. GET /api/nft/<label or full name>[.png]
 */
import { ImageResponse } from "next/og";
import { connection } from "next/server";
import { stewardIdFor } from "@evergreen-names/client";
import { willowGeometry } from "@/app/components/Willow";
import { client } from "@/lib/names";
import { NET, validLabel } from "@/lib/testnet";

const YEAR = 365 * 86400;
const C = { ink: "#070a06", surface: "#0f150d", text: "#ecebdc", muted: "#a4aa93", leaf: "#b6e04a", mid: "#6fbf3c", deep: "#2c7d36", ember: "#ef5a2f", line: "rgba(236,235,220,0.14)" };
const near = (y: bigint) => (Number(y / 10n ** 21n) / 1000).toFixed(3);

function WillowArt({ health, alive }: { health: number; alive: boolean }) {
  const { dots, trunk, ground, width, height } = willowGeometry(alive ? health : 0);
  const leaf = [C.leaf, C.mid, C.deep];
  return (
    <svg width={width * 1.9} height={height * 1.9} viewBox={`0 0 ${width} ${height}`}>
      {trunk.map((d, i) => (
        <circle key={`t${i}`} cx={d.cx} cy={d.cy} r={3.4} fill="#2a3520" />
      ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={d.lit ? 3.6 : 1.1} fill={d.lit ? (alive ? leaf[(d.row + d.col) % 3] : C.ember) : C.line} />
      ))}
      {ground.map((d, i) => (
        <circle key={`g${i}`} cx={d.cx} cy={d.cy} r={1.6} fill={C.deep} />
      ))}
    </svg>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", borderTop: `1px solid ${C.line}`, padding: "11px 0" }}>
      <span style={{ color: C.muted }}>{k}</span>
      <span style={{ color: accent ? C.leaf : C.text }}>{v}</span>
    </div>
  );
}

export async function GET(_req: Request, ctx: RouteContext<"/api/nft/[name]">) {
  await connection();
  const raw = decodeURIComponent((await ctx.params).name).toLowerCase().replace(/\.png$/, "");
  const name = raw.endsWith(`.${NET.namespace}`) ? raw : `${raw}.${NET.namespace}`;
  if (!validLabel(name.slice(0, -NET.namespace.length - 1))) return new Response("bad name", { status: 400 });

  const c = client();
  const lease = await c.getLease(name).catch(() => null);
  if (!lease) return new Response("no such Name", { status: 404 });
  const steward = await c.getSteward(lease.owner).catch(() => null);
  // Evergreen = the NFT's owner is the Steward its Patron derived for it (not just any contract).
  const evergreen = !!steward && steward.name === name && lease.owner === stewardIdFor(name, steward.patron);
  const alive = lease.status === "active" || lease.status === "grace";
  const days = Math.max(0, Math.floor(lease.secondsLeft / 86400));
  const label = name.slice(0, -NET.namespace.length - 1);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: C.ink, color: C.text, fontSize: 26, padding: 56, gap: 56 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 520, borderRadius: 28, background: C.surface }}>
          <WillowArt health={lease.secondsLeft / YEAR} alive={alive} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 12, fontSize: 18, letterSpacing: 2, color: evergreen ? C.leaf : C.muted }}>
            {evergreen ? "EVERGREEN NFT · PAYS ITS OWN RENT" : "NEAR NAME · NEP-171 NFT"}
          </div>
          <div style={{ display: "flex", fontSize: 76, marginTop: 18, lineHeight: 1 }}>{label}</div>
          <div style={{ display: "flex", fontSize: 22, color: C.muted, marginTop: 10 }}>.{NET.namespace}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 28 }}>
            <Row k="Lease" v={alive ? `${days} days left` : lease.status} accent={alive} />
            {evergreen && steward ? (
              <div style={{ display: "flex", flexDirection: "column" }}>
                <Row k="Staked by the NFT itself" v={`${near(steward.stakedYocto)} NEAR`} />
                <Row k="Principal, never spent" v={`${near(steward.principalYocto)} NEAR`} />
                <Row k="Renewed itself" v={`${steward.renewals.length} ${steward.renewals.length === 1 ? "time" : "times"}`} accent />
                <Row k="Owner" v="its Steward contract" />
              </div>
            ) : (
              <Row k="Owner" v={lease.owner.length > 30 ? `${lease.owner.slice(0, 28)}…` : lease.owner} />
            )}
          </div>
          <div style={{ display: "flex", marginTop: "auto", fontSize: 20, color: C.muted }}>evergreen-names.vercel.app · NEAR testnet</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } },
  );
}
