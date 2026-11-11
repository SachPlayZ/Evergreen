# Evergreen — build plan

Deadline: submit by **14 Nov 12:00 UTC** (hard close 23:59 UTC). Terms: `GLOSSARY.md`. Contract facts: `contracts/upstream` @ `d85860a`.

## Decisions (grilling Q1–Q44 + NFT-only pivot)

- **Pitch:** "NEAR names now expire; this one keeps itself alive." No SDK mention in README headline or video. Track: `nfts` only in effort; `open` ticked on form, nothing built for it. Solo. Proof agent dropped.
- **Mechanism:** Steward contract owns Name and is a registered wallet extension (ADR 0001). Invariant: staked Name never passes Grace (stake-leak risk). `poke()` open to all, acts within N days of expiry, no bounty. Two-phase: unstake next Rent + 10% buffer from rewards → withdraw → `renew_sub_account` → claim `pending_refunds`. Patron can `exit()` (unstake all, clear assets, transfer Name back).
- **Lifelines:** Tips add to Stake; anyone can pay Rent directly; public ICU page lists at-risk Names.
- **Demo env:** `near-workspaces` sandbox primary (`pnpm demo`); testnet copy backs hosted page. Demo pool = forked stub pool with admin reward drip, labelled. Keeper refreshes NEAR/USD rate in sandbox (6h staleness). 60s lease/grace, labelled.
- **Demo Namespace:** Open, Standard (×1.5) → `alice.demo` = $30/yr.
- **Mainnet proof:** one Evergreen Name on mainnet, small real stake, labelled unaudited — only if sandbox spike passes 11 Nov AND registry address found by 12 Nov midday.
- **Client (internal, not a deliverable):** private TS package `@evergreen-names/client` shared by CLI, web, Keeper: `getPrice`, `rent`, `renew`, `getLeaseStatus`, `checkBeforePaying`, `claimRefund`, Steward `adopt`/`poke`/`tip`/`exit`/status. Config `{network, registryId, rpcUrl}`; sandbox + testnet presets, mainnet empty until confirmed. Not published, no docs/quickstart.
- **checkBeforePaying:** on-chain only. `expectOwner` compare + recent `rented_at`. Returns `{ok, warnings}`; codes `IN_GRACE`, `RECLAIMABLE`, `OWNER_CHANGED`, `RECENTLY_RENTED`, `EXPIRES_SOON`. Never blocks. Powers ICU page + fallback.
- **CLI:** `evergreen price|rent|status|steward adopt|tip|keeper run|check|demo`.
- **AGENTS.md:** short root file for screeners (how to run, what to check). No skill, no skill eval.
- **Screener-proofing:** prebuilt wasm + SHA-256 + `pnpm build:contracts` to verify; GH Actions runs `pnpm demo` + tests, badge in README. README states Steward is new + unaudited; registry/wallet audited, unmodified, pinned.
- **Repo:** pnpm monorepo — `packages/client`, `packages/cli`, `apps/web`, `contracts/steward`, `contracts/demo-pool`, `keeper/`, `contracts/upstream` submodule @ `d85860a`. MIT (upstream keeps own licence).
- **Hosting:** read-only living card/ICU page on Cloudflare or Vercel, up until 25 Nov.
- **Traction:** 13 Nov X launch of mainnet Evergreen Name + ICU "tip to keep it alive"; README shows live on-chain Tip count. Needs mainnet go.
- **Adopt flow:** "Make my Name Evergreen" one-flow button on web — core, not stretch.
- **Upstream:** issue on `houseofstake/tla-contracts` sharing Evergreen + contract gotchas (credibility). No npm publish.
- **Video:** side-by-side cards, bob decays/swept vs alice self-renews; pitch line frame 1; mainnet link close; no terminal narration.
- **Cut:** SDK framing/docs/quickstart, npm publish, agent skill + eval, demo step 7, Agent Budget demo, `listBy*`, `daysLeft`/`transfer` helpers.
- **Freed-time priority:** Steward robustness → living card + ICU → mainnet Name + Tip launch → adopt flow → video polish.
- **Never cut:** Steward self-renewal, rent/renew/status, `checkBeforePaying`, living card, README steps.

## 11 Nov — gate
- [x] Monorepo skeleton; submodule pinned; move `web-levkit` → `apps/web`
- [ ] Sandbox deploys fleet with 60s lease/grace, Open Standard `demo` Namespace, rate set
- [ ] Demo pool (stub fork + reward drip)
- [ ] Steward spike: adopt Name, stake, drip, `poke()` renews from rewards, principal unchanged
  - [ ] Steward is registered wallet extension after transfer; can drive Name (1 yocto)
  - [ ] Payment path: (a) Name calls registry via `w_execute_extension`, else (b) Name → Steward → registry
  - [ ] Lapse a staked Name: where does stake end up? (stake-leak check)
- [ ] **Go/no-go**: fail → fallback pay-safely page
- [ ] Search mainnet registry address (explorers, NEAR Accounts, release tags)

## 12 Nov
- [ ] Steward robust: view-driven idempotent poke, two-phase unstake, refund claim, tips, `exit()`, lapse guard (unstake all before Grace ends), renewal window 30d/30s, edge cases (poke outside window, stale rate), tests
- [ ] Client core + tests vs sandbox
- [ ] CLI + `evergreen demo` end-to-end
- [ ] Prebuilt wasm + checksums; GH Actions green
- [ ] Mainnet decision (midday)

## 13 Nov
- [ ] Living card + ICU page; hosted on testnet copy
- [ ] Mainnet Evergreen Name (if go)
- [ ] User: X launch of mainnet Evergreen Name + ICU (if mainnet go)
- [ ] Adopt flow button
- [ ] README "do X, see Y", labels, libraries/AI-written list, licence; short AGENTS.md
- [ ] Open upstream issue

## 14 Nov (by 12:00 UTC)
- [ ] 90s video (polish)
- [ ] User: X post (@NEARProtocol, #NEARHackathon)
- [ ] User: prize account, final submission review (tracks `nfts` + `open`)
- [ ] User: message House of Stake (send 11 Nov; Claude drafts)

## Review
_(fill after build)_
