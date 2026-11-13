# Evergreen

**NEAR names now expire. An Evergreen Name pays its own Rent, from its own staking rewards, forever.**

[![ci](https://github.com/SachPlayZ/Evergreen/actions/workflows/ci.yml/badge.svg)](https://github.com/SachPlayZ/Evergreen/actions/workflows/ci.yml)

Live demo: **https://evergreen-names.vercel.app** · Built at **NEAR HACKATHON** (Nov 2026) · Tracks: **NFTs That Do Something**, **Open Innovation**

A NEAR Top Level Account Name (`alice.bot`) is an NFT that is also a real account: it holds money and keys. Evergreen makes that NFT *do something*: it stakes its own NEAR, and a small contract uses the rewards to renew the Name's Lease every year. The principal is never spent. Nobody has to remember anything.

---

## For judges and AI reviewers: verify it in 3 commands

Needs **Node 22+** and **pnpm**. No Rust, no keys, no wallet, no network accounts. Everything runs on a local NEAR sandbox (a real `neard` node, downloaded by `near-sandbox`).

```bash
pnpm install
pnpm test    # ~2.5 min · 7 scenarios through the TypeScript client against a local NEAR chain
pnpm demo    # ~2.5 min · the whole story end to end · prints PASS/FAIL per claim · exits non-zero on any FAIL
```

**What you should see from `pnpm demo`** (a real run; every PASS line is an assertion, and the process exits 1 on any FAIL):

```
== 3. Make alice.demo Evergreen
   PASS  the Steward contract ev-alice-demo.ana now owns alice.demo
   PASS  alice.demo staked 30.000 NEAR of its own NEAR
== 4. A stranger sends a Lifeline
   PASS  fan's Tip joined the Stake: principal is now 32.000 NEAR
== 6. The result
   PASS  alice.demo is still Active (54s left)
   PASS  alice.demo renewed itself 2 times with no payment from ana
   PASS  principal untouched: 35.158 NEAR staked, principal 32.000 NEAR
   PASS  bob.demo is Reclaimable: anyone can take it
== 7. ana takes her Name back
   PASS  alice.demo is back with ana; a Name is never locked in
```

(Seconds left and the staked total vary slightly run to run.)

The same three commands run on every push in [CI](.github/workflows/ci.yml) (plus `pnpm typecheck`, a checksum check of every prebuilt contract, and a production build of the page).

### Every claim, and where it is proven

| Claim | Proof (run it or read it) |
| --- | --- |
| An Evergreen Name renews itself from staking rewards, and never from principal | `pnpm demo` steps 5–6 · test `an Evergreen Name pays its own Rent from staking rewards, and never from principal` ([steward.test.ts](packages/client/test/steward.test.ts)) |
| Anyone can trigger a renewal (`poke`), so no trusted keeper is needed | [`contracts/steward/src/lib.rs`](contracts/steward/src/lib.rs) `poke()` · the demo's keeper is an unrelated account |
| If rewards can't cover Rent, the whole Stake is pulled out of the pool *before* expiry, so nothing is lost; a Lifeline (Tip or direct Rent) revives it | test `if Rent cannot be covered, the Stake is pulled out of the pool before expiry; a Lifeline revives it` |
| Without Evergreen, a lapsed Name goes to whoever reclaims it, **and so does any stake behind it** | test `a staked Name that lapses hands its stake to the next renter` ([lease.test.ts](packages/client/test/lease.test.ts)) · `pnpm demo` step 6 (bob.demo) |
| The owner can take the Name back at any time | `pnpm demo` step 7 (`exit()`) |
| Registry, wallet, registrar, extension and recovery are House of Stake's contracts, **unmodified** | [`contracts/upstream`](contracts/upstream) is a git submodule pinned at `d85860a` · prebuilt wasm checked against [`contracts/wasm/SHA256SUMS`](contracts/wasm/SHA256SUMS) in CI · rebuild: `pnpm build:contracts` (Rust + cargo-near) |
| It also works on House of Stake's *testnet* contract version, with a real one-year Lease | test `on House of Stake's testnet contracts, an Evergreen Name renews its one-year Lease from ...` ([testnet-stack.test.ts](packages/client/test/testnet-stack.test.ts)) · and live on testnet, below |
| 80 Names are rented on NEAR mainnet today, each one expiring | the page reads `registry.hos` live: `curl https://evergreen-names.vercel.app/api/mainnet` |

## See it running (no install)

**1. The live chain (60-second Leases so you can watch).** Open https://evergreen-names.vercel.app → scroll to **Live**.

- `alice.demo` is Evergreen → **see** its countdown fall to ~25s, then jump back to ~83s. "Renewed itself" goes up by one, a moth flies off, **Principal stays at 32.00**.
- `bob.demo` has no Steward → **see** it turn ember (Grace), then grey "Gone" (Reclaimable). The demo re-rents it so the cycle repeats.

This is a real NEAR node (sandbox) on a small VM, with a keeper that pokes alice; the page reads it through a read-only RPC gateway ([`deploy/`](deploy)). It stays up through judging.

**2. A real one on NEAR testnet (one-year Lease, a real validator).** Same page, section *"And one for real, on testnet"*, or straight from the chain:

```bash
curl -s https://evergreen-names.vercel.app/api/testnet
```

- Name `evergreen.ev.sachindraz.testnet`, owned by Steward [`ev-evergreen-ev-sachindraz-testnet.sachindraz.testnet`](https://testnet.nearblocks.io/address/ev-evergreen-ev-sachindraz-testnet.sachindraz.testnet), staking 1 NEAR with `aurora.pool.f863973.m0`.
- On 14 Nov its first real rewards arrived (0.000066 NEAR, more than the 0.0000049 NEAR Rent + buffer), and the Steward started its first self-renewal: `phase` is `Unstaking → Renew`. A real pool holds unstaked NEAR for 4 epochs (~2 days); then `phase` goes `Withdrawing → Renewing`, `renewals` becomes 1, and the Lease grows by a year. Every step is a transaction you can see on nearblocks.

**3. Your own chain, your own browser:**

```bash
pnpm evergreen sandbox --story   # terminal 1: local chain + the alice/bob story
pnpm evergreen keeper run        # terminal 2: pokes alice when Rent is due
pnpm dev:web                     # terminal 3: http://localhost:3000
```

## The problem

House of Stake's [Top Level Accounts](https://github.com/houseofstake/tla-contracts) let anyone rent a short Name like `alice.bot` on NEAR mainnet. It is an NFT (NEP-171) **and** a live account with its own balance and keys. Names are leased for a year. Miss one renewal and, after a 14-day Grace, **anyone can reclaim the Name, and everything sent to it afterwards goes to them**. In our sandbox spike we found the worse case: NEAR left staked behind a lapsed Name passes to the next renter too ([test](packages/client/test/lease.test.ts)).

A Name that holds money should not depend on its owner remembering a date.

## How it works

```
 you ──hand over──▶ Steward contract ──stakes──▶ staking pool   (principal: never spent)
                         ▲                            │
       anyone: poke() ───┘           rewards only ◀───┘
                         │
                         └──▶ registry.renew  ──▶  Lease + 1 year
```

1. You transfer the Name to its **Steward**, a small contract that becomes the Name's Owner and a registered extension of its wallet ([why it must be a contract](docs/adr/0001-steward-contract-owns-the-name.md)).
2. The Steward stakes the Name's NEAR with a validator.
3. When Rent is due, **anyone** calls `poke()`. The Steward walks `Idle → Unstaking → Withdrawing → Renewing`: it unstakes only the accrued rewards, withdraws them, and pays Rent through the registry's permissionless `renew_sub_account`.
4. **Lapse guard:** if rewards can't cover Rent before the Lease ends, the Steward pulls the whole Stake home first, so a lapse can never take it.
5. **Lifeline:** anyone can top it up with a Tip (joins the Stake) or pay Rent directly. The owner (the Patron) can `exit()` any time and get the Name back.

Rent is priced in dollars by the registry; at ~5% staking yield, about **$150 staked once covers $7.50 Rent a year** for a 12+ character Name.

## What is real and what is demo-only

| | |
| --- | --- |
| **Real, unmodified** | House of Stake registry, wallet, registrar, extension, recovery: built from [`contracts/upstream`](contracts/upstream) @ `d85860a` (mainnet version) and @ `d12a84b` (their testnet version, [`contracts/wasm/d12a84b`](contracts/wasm/d12a84b)). Checksums verified in CI. |
| **New (this hackathon), unaudited** | [`contracts/steward`](contracts/steward) (Rust, near-sdk), the TypeScript client, CLI, keeper and page. |
| **Demo-only** | On the hosted/local chain: 60-second Leases and Grace (real: 1 year / 14 days), and [`contracts/demo-pool`](contracts/demo-pool), which pays rewards on demand and releases unstaked NEAR at once (real pools: ~5%/yr, 4-epoch delay). The keeper also plays the price oracle there. On testnet: Rent is set to $0.00001/yr so one epoch of real rewards covers it. |
| **Why our own testnet registry** | House of Stake's testnet registries can't rent right now (their price oracle stopped updating on 7 Oct 2026, so every rent fails `rate_stale`). We deployed their exact testnet version, unmodified, and every Name's wallet runs their published wallet code (`impl.hosdemo.testnet`). Reproduce: `pnpm evergreen testnet deploy --account you.testnet` (~17 testnet NEAR). |

## Layout

| Path | What |
| --- | --- |
| [`contracts/steward`](contracts/steward) | The Steward contract (Rust, near-sdk) |
| [`contracts/demo-pool`](contracts/demo-pool) | Demo staking pool (sandbox only) |
| [`contracts/upstream`](contracts/upstream) | House of Stake Top Level Accounts contracts (submodule, never modified) |
| [`contracts/wasm`](contracts/wasm) | Prebuilt wasm + SHA256SUMS, so no Rust is needed to verify |
| [`packages/client`](packages/client) | TypeScript client; all tests live in `test/` |
| [`packages/sandbox`](packages/sandbox) | Deploys the whole stack to a local sandbox, or to testnet |
| [`packages/cli`](packages/cli) | `evergreen` CLI: the demo, the keeper, testnet deploy |
| [`apps/web`](apps/web) | The page (Next.js): live chain, testnet Name, mainnet census |
| [`deploy`](deploy) | systemd units + nginx for the hosted demo chain, keeper and gateway |

Terms: [GLOSSARY.md](GLOSSARY.md) · Decisions: [docs/adr](docs/adr) · Agent notes: [AGENTS.md](AGENTS.md)

## Disclosures

- **All code was written during the hackathon** (first commit 11 Nov 2026, after the 19 Oct announcement). No pre-hackathon code, no existing product on another chain. This is our only submission.
- **Third-party code:** House of Stake [tla-contracts](https://github.com/houseofstake/tla-contracts) (unmodified, pinned). Libraries: near-sdk (Rust), near-api-js, near-sandbox, vitest, tsx, Next.js, React, motion, Lenis, Phosphor Icons.
- **AI:** built with Claude Code (Anthropic). Code, tests and the page were AI-generated and reviewed by the author.
- **Art** on the page is adapted from reference images (willow woodcut, luna moths, painted cat).

## License

[MIT](LICENSE), except `contracts/upstream` (its own licence).
