# Evergreen

**NEAR names now expire. An Evergreen Name pays its own Rent.**

Live: **https://evergreen-names.vercel.app** · Built for NEAR HACKATHON (Nov 2026), tracks: NFTs That Do Something, Open Innovation

## The problem

NEAR's Top Level Accounts let anyone rent a short Name like `alice.bot`: an NFT that is also a real account, holding money and keys. Names are leased for a year. Miss one renewal and, after a short Grace, **anyone can reclaim the Name, and whatever is sent to it afterwards goes to them**. Mainnet already has 79 rented Names, every one on a countdown its owner has to remember.

## What Evergreen does

A small **Steward** contract becomes the Name's Owner. The Name's NEAR is staked; the staking rewards pay the Rent. Anyone can `poke` the Steward when Rent is due: it unstakes just the rewards, withdraws, and renews. The principal is never spent. If rewards cannot cover Rent, a **lapse guard** pulls the whole Stake out of the pool before expiry, so nothing is lost, and anyone can send a **Lifeline** (a Tip or direct Rent) to revive it. The Patron can `exit()` and take the Name back at any time.

The registry and wallet are the **unmodified** House of Stake Top Level Accounts contracts. Evergreen only adds the Steward (see [ADR 0001](docs/adr/0001-steward-contract-owns-the-name.md) for why it has to be a contract).

## Try it

**Watch it (no install):** open https://evergreen-names.vercel.app and scroll to *Live*. Leases there last 60 seconds instead of a year.
- `alice.demo` is Evergreen → see its countdown drop to ~30s, then jump back to ~80s; "Renewed itself" goes up by one and a moth flies off. *Principal* stays at 32.00.
- `bob.demo` has no Steward → see it turn ember (Grace), then grey "Gone" (Reclaimable). The keeper re-rents it a little later so the cycle repeats.

**Verify it yourself** (Node 22+, pnpm; no Rust, no keys, no accounts):

```bash
pnpm install
pnpm demo   # ~2.5 min: whole story on a local NEAR sandbox, prints PASS/FAIL per claim, exits non-zero on any FAIL
pnpm test   # 6 scenarios through the client against the same sandbox
```

In `pnpm demo` output, see: `alice.demo renewed itself 2 times`, `principal untouched`, `bob.demo is Reclaimable`.

**Run the page locally against your own chain:**

```bash
pnpm evergreen sandbox --story   # terminal 1: chain + the alice/bob story
pnpm evergreen keeper run        # terminal 2: pokes alice when due
pnpm dev:web                     # terminal 3: http://localhost:3000
```

The page also reads **mainnet** live: every rented Name and which runs out first.

## What is real and what is demo-only

| | |
| --- | --- |
| Real | Registry, wallet, registrar, extension, recovery: unmodified Top Level Accounts contracts, prebuilt from `contracts/upstream` (pinned `d85860a`). Checksums in `contracts/wasm/SHA256SUMS`; rebuild with `pnpm build:contracts` (Rust + cargo-near). |
| New, unaudited | `contracts/steward` |
| Demo-only | 60s Leases and Grace (real: 1 year / 14 days). `contracts/demo-pool` pays rewards on demand and releases unstaked NEAR at once (real pools: ~5%/yr, 2-3 epoch delay). The keeper also plays the price oracle and the pool's rewards. |

On House of Stake's own testnet registry (`registry.hosdemo.testnet`, contracts compatible with ours), `pnpm evergreen testnet adopt <label>.hosdemo.testnet --account you.testnet` rents a Name and makes it Evergreen in a real testnet staking pool, deploying only the Steward (about 6 testnet NEAR). It needs that registry's NEAR/USD rate to be fresh; its oracle has been idle since 27 Aug 2026.

The hosted demo is a NEAR sandbox on a small VM, served through a read-only RPC gateway (`deploy/`). A faithful testnet copy is scripted (`pnpm evergreen testnet deploy --account you.testnet`) but costs ~74 testnet NEAR, mostly the wallet code published as a global contract.

## Layout

| Path | What |
| --- | --- |
| `contracts/steward` | Steward contract (Rust, near-sdk) |
| `contracts/demo-pool` | Demo staking pool |
| `contracts/upstream` | Top Level Accounts contracts (submodule, never modified) |
| `packages/client` | TypeScript client; the tests live in `test/` |
| `packages/sandbox` | Deploys the whole stack to a local sandbox (or testnet) |
| `packages/cli` | `evergreen` CLI, the demo and the keeper |
| `apps/web` | The page (Next.js) |
| `deploy/` | VM units for the hosted demo chain, keeper and gateway |

Terms: [GLOSSARY.md](GLOSSARY.md).

## Built with

- Third-party contracts: House of Stake [tla-contracts](https://github.com/houseofstake/tla-contracts) @ `d85860a`, unmodified.
- Libraries: near-sdk (Rust), near-api-js, near-sandbox, vitest, tsx, Next.js, React, motion, Lenis, Phosphor Icons.
- AI: written with Claude Code (Anthropic); code, tests and the page were AI-generated and reviewed by the author.
- Art on the page is adapted from reference images (willow woodcut, luna moths, painted cat, halftone dino).

## License

MIT, except `contracts/upstream` (its own licence).
