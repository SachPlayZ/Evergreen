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
- **Web design direction (user, 12 Nov):** base the interface on the 3 reference JPGs in `apps/web/public/` (Pinterest inspiration, gitignored, not to be shipped as assets): lime/chartreuse greens on black with cream accents; woodcut-hatch willow landscape, halftone/pixel-dot mosaic, raw neon brush strokes. Build original art in that style (dot-grid/halftone living card, hatch textures); do not reuse the images themselves.
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
- [x] Demo pool (stub fork + reward drip)
- [x] Steward spike: adopt Name, stake, drip, `poke()` renews from rewards, principal unchanged
  - [x] Steward is registered wallet extension after transfer; can drive Name (1 yocto)
  - [x] Payment path: (a) Name calls registry via `w_execute_extension`, else (b) Name → Steward → registry
  - [x] Lapse a staked Name: where does stake end up? (stake-leak check)
- [x] **Go/no-go**: GO
- [x] Mainnet registry address: `registry.hos` (from `account`.config() on mainnet; wallet impl `impl.hos`, extension `ext.hos`, council `hos-root.sputnik-dao.near`). Live stats 11 Nov: 1,008 Namespaces, 79 Names, rate $3.66/NEAR, grace 14d.

### Spike RESULT (run 11 Nov, sandbox, `cd contracts/spike && cargo test --test spike -- --nocapture`) — GO
- P1 PASS: after `transfer_sub_account`, Steward is registry owner AND wallet extension; it drives the Name (staked 30 NEAR).
- P2 PASS (path a): pokes ran unstaking → withdrawing → renewing; Name paid its own renewal; expiry +1 term; staked 33.526 ≥ principal 32; 0.474 NEAR overpay sits in pending_refunds.
- Tip PASS (+2 NEAR to principal); exit PASS (Name back to Patron).
- P3 CONFIRMED LEAK: after lapse + reclaim + re-rent, the NEW renter unstaked and withdrew the old renter's 5 NEAR stake. Old renter only got the liquid sweep. So the lapse guard is mandatory, and this goes in the upstream issue.
- NEW: `transfer_sub_account` sweeps the Name's NEAR (40.2 → 0.008), so the adopt flow is transfer first, then fund and stake.
- NEW: a Name with ~0 balance can't act (balance reserve), so keep a small liquid buffer on the Name.
- Not yet tested: real pool unstake delay, stale rate, lapse guard, refund claim + restake.

### Spike notes (code read, before run)
- Toolchain: rust 1.97.1 + wasm32 ok; `cargo install --locked cargo-near` started; near-workspaces fetches sandbox itself.
- Harness: reuse upstream `integration/tests/common` (deploy_fleet, deploy_registry_with_terms(60s,60s), rent, fast_forward 4000 blocks). Wasm read from `upstream/target/near/<name>/`.
- Payment path (a) likely OK: wallet `execute_request` blocks only self-calls; owner calls are unmetered (`hos-wallet/src/lib.rs:950`, `:1124`). Verify by run.
- Stake leak: upstream test `an_unlisted_token_rides_the_name_to_its_next_renter` (`integration/tests/reclaim.rs:584`) shows unswept assets go to the next renter, who gets the wallet. Pool stake almost certainly the same, so the lapse guard is required.
- Transfer: needs predecessor == Owner + 1 yocto (`marketplace.rs:265`), which a Steward contract can do.
- Stub pool has no rewards, so the demo pool must add a reward drip.
- Next: build wasm (cargo near), new crate `contracts/spike` with probes P1 extension after transfer, P2 path (a), P3 lapse a staked Name, then re-rent and withdraw.

## 12 Nov
- [x] Steward robust: view-driven idempotent poke, two-phase unstake, refund claim, tips, `exit()`, lapse guard (unstake all before Grace ends), renewal window 30d/30s, edge cases (poke outside window, stale rate), tests
- [x] Client core + tests vs sandbox (6 scenarios, `pnpm test`)
- [x] CLI + `evergreen demo` end-to-end (`pnpm demo`, ~2m20s)
- [x] Prebuilt wasm + checksums; GH Actions green (typecheck, tests, demo, web build)
- [ ] Mainnet decision (address found, so technically GO; needs user: real NEAR, a real Name, a real pool choice)
- NEW finding: the wallet refuses its Owner once expiry passes, so the Steward must finish (or evacuate) BEFORE expiry, not before Grace ends. Built in and tested.
- Idea for web: mainnet is readable now, so the page can list all 79 real Names with their expiry dates.

## 13 Nov
- [x] Living card + ICU + mainnet census page (`pnpm evergreen sandbox --story`, `pnpm evergreen keeper run`, `pnpm dev:web`)
- [ ] Host the page (needs a testnet copy of the contracts, or mainnet section only)
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

## Web redesign (12 Nov)
- [x] Cut art from the 4 reference images (`apps/web/scripts/cut-art.mjs` -> `public/art/`)
- [x] Design system in `globals.css` (tokens, Newsreader + Geist, radius rule, one accent)
- [x] Hero: willow woodcut in motion, moths, live Name card
- [x] Live, How (sticky halftone), Lapse (cat) + mainnet census, Cost picker, night footer
- [x] Checked in browser at 1280 and 375: no console errors, no sideways scroll
- [x] Live sandbox: alice.demo renewed itself (22s -> 80s, count 1, moth fired); bob.demo went to Grace in ember with a Lifeline command
- [x] Reclaimable state (bob.demo: "Gone", greyed) and `next build` both pass

## Review
- Web redesign: typecheck, lint and build clean (old `any` catches fixed).
- Hero headline is 3 lines at 1280 wide, kept on purpose.
- 1,008 Namespaces vs 79 Names is correct: `tla_count` is `tlas.len()` in the registry, `sub_account_count` is rented Names.
