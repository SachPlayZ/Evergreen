// Read-only window onto the demo chain, for the hosted web page.
//
// The demo chain is a NEAR sandbox whose accounts all use the sandbox's well-known default key,
// so its raw RPC must never be public: anyone could sign as any account or fast-forward time.
// This gateway forwards only reads (view calls, account views, blocks, status) and refuses
// everything else, including transactions and the sandbox_* methods.
//
//   GATEWAY_PORT=4000 UPSTREAM=http://127.0.0.1:3030 node deploy/rpc-gateway.mjs
import { createServer } from "node:http";

const PORT = Number(process.env.GATEWAY_PORT ?? 4000);
// Local only by default: nginx serves it over HTTPS.
const HOST = process.env.GATEWAY_HOST ?? "127.0.0.1";
const UPSTREAM = process.env.UPSTREAM ?? "http://127.0.0.1:3030";
const READ_METHODS = new Set(["block", "status", "gas_price"]);
const READ_QUERIES = new Set(["call_function", "view_account", "view_code"]);
const MAX_BODY = 64 * 1024;

function allowed(req) {
  if (!req || typeof req !== "object" || Array.isArray(req)) return false;
  if (READ_METHODS.has(req.method)) return true;
  if (req.method !== "query") return false;
  const p = req.params;
  // near-api-js sends query params as an object with request_type
  return Boolean(p && typeof p === "object" && !Array.isArray(p) && READ_QUERIES.has(p.request_type));
}

const reply = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") return reply(res, 200, { ok: true });
  if (req.method !== "POST") return reply(res, 405, { error: "POST JSON-RPC reads only" });
  let size = 0;
  const chunks = [];
  req.on("data", (c) => {
    size += c.length;
    if (size > MAX_BODY) req.destroy();
    else chunks.push(c);
  });
  req.on("end", async () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return reply(res, 400, { error: "invalid JSON" });
    }
    if (!allowed(body)) {
      return reply(res, 403, { jsonrpc: "2.0", id: body?.id ?? null, error: { code: -32601, message: "read-only gateway" } });
    }
    try {
      const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      reply(res, upstream.status, await upstream.text());
    } catch {
      reply(res, 502, { jsonrpc: "2.0", id: body.id ?? null, error: { code: -32000, message: "demo chain unavailable" } });
    }
  });
}).listen(PORT, HOST, () => console.log(`read-only gateway on ${HOST}:${PORT} -> ${UPSTREAM}`));
