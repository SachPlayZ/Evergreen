# Evergreen — build plan

Deadline: submit by **14 Nov 12:00 UTC** (hard close 23:59 UTC). Terms: `GLOSSARY.md`. Contract facts: `contracts/` @ `d85860a`.

## Decisions (grilling Q1–Q40)

- **Pitch:** "NFTs on NEAR now expire. We made one that keeps itself alive." Product = Evergreen Names; Evergreen SDK + skill = "built with". Tracks: `nfts` (hero), `open`. Solo. Proof agent dropped.
- **Mechanism:** Steward contract owns Name (ADR 0001). `poke()` open to all, acts within N days of expiry, no bounty. Two-phase: unstake next Rent + 10% buffer from rewards → withdraw → `renew_sub_account` → claim `pending_refunds`. Patron can `exit()` (unstake all, clear assets, transfer Name back).
- **Lifelines:** Tips add to Stake; anyone can pay Rent directly; public ICU page lists at-risk Names.
- **Demo env:** `near-workspaces` sandbox primary (`pnpm demo`); testnet copy backs hosted page. Demo pool = forked stub pool with admin reward drip, labelled. Keeper refreshes NEAR/USD rate in sandbox (6h staleness). 60s lease/grace, labelled.
- **Demo Namespace:** Open, Standard (×1.5) → `alice.demo` = $30/yr.
- **Mainnet proof:** one Evergreen Name on mainnet, small real stake, labelled unaudited — only if sandbox spike passes 11 Nov AND registry address found by 12 Nov midday.
- **SDK (TS only, `@evergreen-names/sdk`):** `getPrice`, `rent`, `renew`, `getLeaseStatus`, `daysLeft`, `transfer`, `checkBeforePaying`, `claimRefund`. Config `{network, registryId, rpcUrl}`; sandbox + testnet presets, mainnet empty until confirmed.
- **checkBeforePaying:** on-chain only. `expectOwner` compare + recent `rented_at`. Returns `{ok, warnings}`; codes `IN_GRACE`, `RECLAIMABLE`, `OWNER_CHANGED`, `RECENTLY_RENTED`, `EXPIRES_SOON`. Never blocks.
- **CLI:** `evergreen price|rent|status|budget grant|budget try-overspend|steward adopt|tip|keeper run|check|demo`.
- **Skill:** `skill/SKILL.md` + `skill/reference/` + root `AGENTS.md`. Eval: fresh `claude -p` rents+renews `carol.demo`, log in `skill/eval/`.
- **Screener-proofing:** prebuilt wasm + SHA-256 + `pnpm build:contracts` to verify; GH Actions runs `pnpm demo` + tests, badge in README. README states Steward is new + unaudited; registry/wallet audited, unmodified, pinned.
- **Repo:** pnpm monorepo — `packages/sdk`, `packages/cli`, `apps/web` (moved from `web-levkit`), `contracts/steward`, `contracts/demo-pool`, `skill/`, `keeper/`, `contracts/upstream` submodule @ `d85860a`. MIT (upstream keeps own licence).
- **Hosting:** read-only status/ICU page on Cloudflare or Vercel, up until 25 Nov.
- **Traction (Q41):** 13 Nov X launch of mainnet Evergreen Name + ICU "tip to keep it alive"; README shows live on-chain Tip count. Needs mainnet go.
- **Adopt flow (Q42):** "Make my Name Evergreen" one-flow button on web. After 13 Nov core; first to cut.
- **npm + upstream (Q43):** publish `@evergreen-names/sdk` (version pinned to contract commit); issue on `houseofstake/tla-contracts` offering SDK + skill.
- **Video (Q44):** side-by-side cards, bob decays/swept vs alice self-renews; pitch line frame 1; mainnet link close; no terminal narration.
- **Cut order:** Adopt flow →  `listBy*` → agent budgets → keeper autonomy → live step 7 (keep recorded clip). Never cut rent/renew/status/checkBeforePaying/README steps/living card.

## 11 Nov — gate
- [ ] Monorepo skeleton; submodule pinned; move `web-levkit` → `apps/web`
- [ ] Sandbox deploys fleet with 60s lease/grace, Open Standard `demo` Namespace, rate set
- [ ] Demo pool (stub fork + reward drip)
- [ ] Steward spike: adopt Name, stake, drip, `poke()` renews from rewards, principal unchanged
- [ ] **Go/no-go**: fail → fallback pay-safely page
- [ ] Search mainnet registry address (explorers, NEAR Accounts, release tags)

## 12 Nov
- [ ] Steward complete: two-phase unstake, refund claim, tips, `exit()`, tests
- [ ] SDK core + tests vs sandbox
- [ ] CLI + `evergreen demo` end-to-end
- [ ] Prebuilt wasm + checksums; GH Actions green
- [ ] Mainnet decision (midday)

## 13 Nov
- [ ] Living card + ICU page; hosted on testnet copy
- [ ] Skill + reference + AGENTS.md; run eval, save log
- [ ] Mainnet Evergreen Name (if go)
- [ ] README "do X, see Y", labels, libraries/AI-written list, licence
- [ ] Publish `@evergreen-names/sdk` to npm; open upstream issue
- [ ] User: X launch of mainnet Evergreen Name + ICU (if mainnet go)
- [ ] Adopt flow button (stretch)

## 14 Nov (by 12:00 UTC)
- [ ] 90s video
- [ ] User: X post (@NEARProtocol, #NEARHackathon)
- [ ] User: prize account, final submission review
- [ ] User: message House of Stake (send 11 Nov; Claude drafts)

## Review
_(fill after build)_
