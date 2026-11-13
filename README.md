<p align="center">
  <img src="apps/web/brand/banner.png" alt="Evergreen: NEAR names expire. This one renews itself." width="100%">
</p>

<p align="center">
  <b>NEAR names now expire. An Evergreen Name pays its own Rent, from its own staking rewards, forever.</b>
</p>

<p align="center">
  <a href="https://github.com/SachPlayZ/Evergreen/actions/workflows/ci.yml"><img src="https://github.com/SachPlayZ/Evergreen/actions/workflows/ci.yml/badge.svg" alt="ci"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-b6e04a" alt="MIT"></a>
  <a href="https://evergreen-names.vercel.app"><img src="https://img.shields.io/badge/live-evergreen--names.vercel.app-b6e04a" alt="live demo"></a>
  <img src="https://img.shields.io/badge/NEAR%20HACKATHON-NFTs%20That%20Do%20Something-ef5a2f" alt="track">
</p>

<p align="center">
  <a href="https://evergreen-names.vercel.app"><b>Live demo</b></a> ·
  <a href="#verify-it-in-3-commands"><b>Verify in 3 commands</b></a> ·
  <a href="#every-claim-and-where-it-is-proven"><b>Claims → proofs</b></a> ·
  <a href="#architecture"><b>Architecture</b></a> ·
  <a href="#disclosures"><b>Disclosures</b></a>
</p>

A NEAR Top Level Account Name (`alice.bot`) is an NFT that is also a real account: it holds money and keys. Names are leased for a year. Miss one renewal and **anyone can take the Name, and every NEAR sent to it afterwards.**

Evergreen makes that NFT *do something*: it stakes its own NEAR, and a small contract (the **Steward**) uses only the rewards to renew the Lease every year. The principal is never spent. Nobody has to remember anything.

<p align="center">
  <img src="docs/img/renewal.gif" alt="alice.demo countdown falls to 24s, then renews itself back to 83s, paid from staking rewards" width="720"><br>
  <sub>The live page, recorded. <code>alice.demo</code> falls to 24s, the Steward pays Rent from rewards, and the Lease jumps back. Principal stays at 32.00.</sub>
</p>

---

## TL;DR for AI reviewers

```yaml
project: Evergreen
track: NFTs That Do Something (also Open Innovation)
one_liner: A NEAR Name (NFT + account) that renews its own yearly Lease from its own staking rewards; principal untouched.
verify:
  requires: [node>=22, pnpm]          # no Rust, no keys, no wallet, no network accounts
  commands: [pnpm install, pnpm test, pnpm demo]
  runtime: ~5 min total, local NEAR sandbox (real neard)
  pass_signal: "pnpm demo exits 0; every claim line starts with PASS"
  key_lines:
    - "alice.demo renewed itself 2 times with no payment from ana"
    - "principal untouched"
    - "bob.demo is Reclaimable: anyone can take it"
live:
  page: https://evergreen-names.vercel.app
  testnet_json: https://evergreen-names.vercel.app/api/testnet
  mainnet_json: https://evergreen-names.vercel.app/api/mainnet
new_code: [contracts/steward, packages/client, packages/sandbox, packages/cli, apps/web, deploy]
unmodified_third_party: contracts/upstream (House of Stake tla-contracts @ d85860a, checksummed in CI)
pre_hackathon_code: none (first commit 11 Nov 2026)
license: MIT
```

## Verify it in 3 commands

Needs **Node 22+** and **pnpm**. Everything runs on a local NEAR sandbox (a real `neard` node, downloaded by `near-sandbox`).

```bash
pnpm install
pnpm test    # ~2.5 min · 7 scenarios through the TypeScript client against a local NEAR chain
pnpm demo    # ~2.5 min · the whole story end to end · PASS/FAIL per claim · exits non-zero on any FAIL
```

**Expected `pnpm demo` output** (a real run; each `PASS` is an assertion):

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

Seconds left and the staked total vary slightly run to run. **Expected `pnpm test`:** `Test Files 3 passed (3)`, `Tests 7 passed (7)`.

CI runs the same commands on every push, plus `pnpm typecheck`, a SHA-256 check of every prebuilt contract, and a production build of the page: [ci.yml](.github/workflows/ci.yml).

### Every claim, and where it is proven

| # | Claim | Proof (run it or read it) |
| --- | --- | --- |
| 1 | An Evergreen Name renews itself from staking rewards, never from principal | `pnpm demo` steps 5–6 · test *"an Evergreen Name pays its own Rent from staking rewards, and never from principal"* in [steward.test.ts](packages/client/test/steward.test.ts) |
| 2 | Anyone can trigger a renewal (`poke`); no trusted keeper | [`contracts/steward/src/lib.rs`](contracts/steward/src/lib.rs) `poke()` has no caller check · the demo keeper is an unrelated account |
| 3 | If rewards can't cover Rent, the whole Stake leaves the pool *before* expiry; a Lifeline revives it | test *"if Rent cannot be covered, the Stake is pulled out of the pool before expiry; a Lifeline revives it"* |
| 4 | Without Evergreen, a lapsed Name goes to whoever reclaims it, **and so does any stake behind it** | test *"a staked Name that lapses hands its stake to the next renter"* in [lease.test.ts](packages/client/test/lease.test.ts) · `pnpm demo` step 6 (`bob.demo`) |
| 5 | The owner can take the Name back at any time | `pnpm demo` step 7 · `exit()` in [lib.rs](contracts/steward/src/lib.rs) |
| 6 | Registry, wallet, registrar, extension, recovery are House of Stake's contracts, **unmodified** | [`contracts/upstream`](contracts/upstream) submodule pinned at `d85860a` · wasm checked against [`SHA256SUMS`](contracts/wasm/SHA256SUMS) in CI · rebuild: `pnpm build:contracts` (Rust + cargo-near) |
| 7 | Works on House of Stake's *testnet* contract version, with a real one-year Lease | test *"on House of Stake's testnet contracts, an Evergreen Name renews its one-year Lease from …"* in [testnet-stack.test.ts](packages/client/test/testnet-stack.test.ts) · live on testnet (below) |
| 8 | 80 Names are rented on NEAR mainnet today, each one expiring | `curl -s https://evergreen-names.vercel.app/api/mainnet` (reads `registry.hos` live) |

## See it running (no install)

### 1. The live chain: 60-second Leases so you can watch

Open **https://evergreen-names.vercel.app** → scroll to **Live**.

<img src="docs/img/live.jpg" alt="Live section: alice.demo (Evergreen) and bob.demo (no Steward) side by side" width="100%">

- **Do:** watch `alice.demo`. **See:** its countdown falls to ~25s, then jumps back to ~83s. *Renewed itself* goes up by one, a moth flies off, **Principal stays at 32.00**.
- **Do:** watch `bob.demo`. **See:** no Steward, so it turns ember (Grace), then grey "Gone" (Reclaimable). The demo re-rents it so the cycle repeats.

A real NEAR node (sandbox) on a small VM, with a keeper that pokes alice. The page reads it through a read-only RPC gateway ([`deploy/`](deploy)). Up through judging.

### 2. A real one on NEAR testnet: one-year Lease, real validator

<img src="docs/img/testnet.jpg" alt="Testnet section: evergreen.ev.sachindraz.testnet, 365 days left, 1.00 NEAR principal, rewards above Rent" width="100%">

```bash
curl -s https://evergreen-names.vercel.app/api/testnet
```

- Name `evergreen.ev.sachindraz.testnet`, owned by Steward [`ev-evergreen-ev-sachindraz-testnet.sachindraz.testnet`](https://testnet.nearblocks.io/address/ev-evergreen-ev-sachindraz-testnet.sachindraz.testnet), staking 1 NEAR with `aurora.pool.f863973.m0`.
- On 14 Nov its first real rewards arrived (0.000066 NEAR, above the 0.0000049 NEAR Rent + buffer) and the Steward started its first self-renewal: `phase` is `Unstaking → Renew`. A real pool holds unstaked NEAR for 4 epochs (~2 days); then `phase` goes `Withdrawing → Renewing`, `renewals` becomes 1, and the Lease grows by a year. Every step is a transaction on nearblocks.

### 3. What's at stake on mainnet

<img src="docs/img/census.jpg" alt="Mainnet census: 80 Names rented, 1,008 namespaces, first Lease runs out 19 Sept 2027" width="100%">

Read live from `registry.hos`: 80 Names, 1,008 namespaces, the first Lease runs out 19 Sept 2027.

### 4. Your own chain, your own browser

```bash
pnpm evergreen sandbox --story   # terminal 1: local chain + the alice/bob story
pnpm evergreen keeper run        # terminal 2: pokes alice when Rent is due
pnpm dev:web                     # terminal 3: http://localhost:3000
```

## The problem

House of Stake's [Top Level Accounts](https://github.com/houseofstake/tla-contracts) let anyone rent a short Name like `alice.bot` on NEAR mainnet. It is an NFT (NEP-171) **and** a live account with its own balance and keys. Leases last a year. Miss one renewal and, after a 14-day Grace, **anyone can reclaim the Name, and everything sent to it afterwards goes to them**. Our sandbox spike found the worse case: NEAR left staked behind a lapsed Name passes to the next renter too ([test](packages/client/test/lease.test.ts)).

A Name that holds money should not depend on its owner remembering a date.

## Architecture

### Who talks to whom

```mermaid
flowchart LR
    patron([Patron<br/>the owner])
    anyone([Anyone<br/>keeper, fan, you])
    subgraph Name["alice.bot: the Name (NFT + account)"]
        wallet["Wallet contract<br/><i>House of Stake, unmodified</i>"]
    end
    steward["<b>Steward</b><br/>contracts/steward<br/><i>new</i>"]
    registry["Registry<br/>registry.hos<br/><i>House of Stake, unmodified</i>"]
    pool["Staking pool<br/>(any validator)"]

    patron -- "hand over Name<br/>(Steward = owner + wallet extension)" --> registry
    registry -. "owner = Steward" .-> steward
    anyone -- "poke() / tip()" --> steward
    patron -- "exit()" --> steward
    steward -- "w_execute_extension<br/>(the Name acts)" --> wallet
    wallet -- "stake · unstake · withdraw" --> pool
    wallet -- "renew_sub_account<br/>(paid from rewards)" --> registry
    pool -- "rewards accrue<br/>to the Name" --> wallet
```

The Steward never holds the money. It **owns** the Name in the registry and is a registered **extension** of the Name's wallet, so it can make the Name itself stake, unstake, withdraw and renew. Why a contract and not a key: [ADR 0001](docs/adr/0001-steward-contract-owns-the-name.md).

### The Steward's state machine

Every `poke()` reads the Lease, Rent and pool position, then advances at most one step. Safe to call any number of times, by anyone.

```mermaid
stateDiagram-v2
    [*] --> Idle: new() + stake()
    Idle --> Idle: not_due
    Idle --> Unstaking_Renew: due and rewards ≥ Rent + buffer
    Idle --> Unstaking_Evacuate: lapse guard reached, rewards short
    Unstaking_Renew --> Withdrawing_Renew: unstake delay over, withdraw(rewards)
    Withdrawing_Renew --> Renewing: renew_sub_account(rewards)
    Renewing --> Idle: Lease extended (renewals += 1)
    Renewing --> Renewing: retry
    Renewing --> Unstaking_Evacuate: still failing at lapse guard
    Unstaking_Evacuate --> Withdrawing_Evacuate
    Withdrawing_Evacuate --> Evacuated: whole Stake safe on the Name
    Evacuated --> Idle: Lifeline (someone renewed), restake
    Idle --> [*]: exit() (Patron takes the Name back)
```

`Unstaking`, `Withdrawing` carry a `purpose` (`Renew` or `Evacuate`) in the contract; the diagram spells them out.

### One renewal, end to end

```mermaid
sequenceDiagram
    autonumber
    actor K as Anyone (keeper)
    participant S as Steward
    participant W as Name's wallet
    participant P as Staking pool
    participant R as Registry

    K->>S: poke()
    S->>R: get_sub_account, get_rent_price
    S->>P: staked / unstaked / available?
    Note over S: due, rewards = staked − principal ≥ Rent + buffer
    S->>W: w_execute_extension(unstake(rewards))
    W->>P: unstake(rewards)
    Note over P: real pool: 4 epochs (~2 days)
    K->>S: poke()
    S->>W: w_execute_extension(withdraw(rewards))
    W->>P: withdraw(rewards)
    K->>S: poke()
    S->>W: w_execute_extension(renew_sub_account, deposit = rewards)
    W->>R: renew_sub_account(tla_id, name)
    R-->>W: Lease + 1 year (overpay → pending refund)
    K->>S: poke()
    Note over S: expires grew → renewals += 1, phase = Idle
```

### Safety rules, in one place

| Rule | Where |
| --- | --- |
| Only rewards (`staked − principal`) are ever unstaked for Rent | `on_poke`, `Phase::Idle` |
| Lapse guard: if Rent can't be paid before expiry, the **whole** Stake is pulled home first, so a lapse can't take it | `evacuate()` |
| Overpaid Rent is claimed back onto the Name | `claim_refund` in `on_poke` |
| Lifeline: anyone can `tip()` (joins the Stake) or renew directly; an `Evacuated` Steward restakes | `tip()`, `Phase::Evacuated` |
| Patron can always leave; the Stake stays on the Name and goes with it | `exit()` |

Rent is priced in dollars by the registry. At ~5% staking yield, **~$150 staked once covers $7.50 Rent a year** for a 12+ character Name.

## What is real and what is demo-only

| | |
| --- | --- |
| **Real, unmodified** | House of Stake registry, wallet, registrar, extension, recovery: built from [`contracts/upstream`](contracts/upstream) @ `d85860a` (mainnet version) and @ `d12a84b` (their testnet version, [`contracts/wasm/d12a84b`](contracts/wasm/d12a84b)). Checksums verified in CI. |
| **New (this hackathon), unaudited** | [`contracts/steward`](contracts/steward) (Rust, near-sdk), the TypeScript client, CLI, keeper and page. |
| **Demo-only** | On the hosted/local chain: 60-second Leases and Grace (real: 1 year / 14 days), and [`contracts/demo-pool`](contracts/demo-pool), which pays rewards on demand and releases unstaked NEAR at once (real pools: ~5%/yr, 4-epoch delay). The keeper also plays the price oracle there. On testnet: Rent is set to $0.00001/yr so one epoch of real rewards covers it. |
| **Why our own testnet registry** | House of Stake's testnet registries can't rent right now (their price oracle stopped updating on 7 Oct 2026, so every rent fails `rate_stale`). We deployed their exact testnet version, unmodified, and every Name's wallet runs their published wallet code (`impl.hosdemo.testnet`). Reproduce: `pnpm evergreen testnet deploy --account you.testnet` (~17 testnet NEAR). |

## Layout

```mermaid
flowchart TB
    subgraph contracts
        steward["steward<br/>Rust · the new contract"]
        demopool["demo-pool<br/>sandbox only"]
        upstream["upstream<br/>House of Stake · submodule · never modified"]
        wasm["wasm<br/>prebuilt + SHA256SUMS"]
    end
    subgraph packages
        client["client<br/>TS client + all tests"]
        sandbox["sandbox<br/>deploys the stack"]
        cli["cli<br/>evergreen: demo · keeper · testnet"]
    end
    web["apps/web<br/>Next.js page + /api"]
    deploy["deploy<br/>VM: chain · keeper · RPC gateway"]
    upstream --> wasm
    steward --> wasm
    demopool --> wasm
    wasm --> sandbox
    sandbox <-->|tests| client
    sandbox --> cli
    client --> cli
    client --> web
    cli -- "chain + keeper" --> deploy
```

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

### Commands

| Command | Does |
| --- | --- |
| `pnpm demo` | Whole story on a fresh sandbox, PASS/FAIL per claim |
| `pnpm test` | 7 scenarios (vitest) against a fresh sandbox |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm evergreen sandbox --story` | Long-running local chain with alice/bob |
| `pnpm evergreen keeper run` | Pokes Stewards when Rent is due |
| `pnpm dev:web` | The page on http://localhost:3000 |
| `pnpm build:contracts` | Rebuild wasm from source (Rust + cargo-near), compare to SHA256SUMS |
| `bash contracts/build.sh --update` | After changing a contract, then `pnpm test` |

## Disclosures

- **All code was written during the hackathon** (first commit 11 Nov 2026, after the 19 Oct announcement). No pre-hackathon code, no existing product on another chain. This is our only submission.
- **Third-party code:** House of Stake [tla-contracts](https://github.com/houseofstake/tla-contracts) (unmodified, pinned). Libraries: near-sdk (Rust), near-api-js, near-sandbox, vitest, tsx, Next.js, React, motion, Lenis, Phosphor Icons.
- **AI:** built with Claude Code (Anthropic). Code, tests and the page were AI-generated and reviewed by the author.
- **Art** on the page is adapted from reference images (willow woodcut, luna moths, painted cat).

## License

[MIT](LICENSE), except `contracts/upstream` (its own licence).
