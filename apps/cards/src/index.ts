/**
 * cards.evergreennfts.space/<label>.png: a snapshot of a Name's live NFT card, kept in R2.
 * X and other link previews fetch this URL (the og:image of evergreennfts.space/nft/<label>).
 * A snapshot older than FRESH_MS is re-rendered from the site's live card route and stored again.
 */
interface Env {
  CARDS: R2Bucket;
  ORIGIN: string;
}

const FRESH_MS = 60 * 60 * 1000;
const LABEL = /^[a-z0-9]+([-_][a-z0-9]+)*$/;
const HEADERS = { "content-type": "image/png", "cache-control": "public, max-age=600, s-maxage=3600" };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/([^/]+)\.png$/);
    const label = match?.[1].toLowerCase();
    if (!label || label.length < 2 || label.length > 64 || !LABEL.test(label)) {
      return new Response("Usage: /<label>.png", { status: 404 });
    }
    const key = `cards/${label}.png`;

    const stored = await env.CARDS.get(key);
    if (stored && Date.now() - stored.uploaded.getTime() < FRESH_MS) {
      return new Response(stored.body, { headers: { ...HEADERS, "x-card": "r2" } });
    }

    const live = await fetch(`${env.ORIGIN}/api/nft/${label}.png`, { headers: { "user-agent": "evergreen-cards" } });
    if (!live.ok) {
      // Keep serving the last snapshot if the site is down; otherwise pass the error on.
      if (stored) return new Response(stored.body, { headers: { ...HEADERS, "x-card": "r2-stale" } });
      return new Response(await live.text(), { status: live.status });
    }
    const png = await live.arrayBuffer();
    ctx.waitUntil(env.CARDS.put(key, png, { httpMetadata: { contentType: "image/png" } }));
    return new Response(png, { headers: { ...HEADERS, "x-card": "fresh" } });
  },
} satisfies ExportedHandler<Env>;
