# For agents reviewing or working on Evergreen

Evergreen turns an NFT into an economic agent. A NEAR Top Level Account Name is a NEP-171 token that is also a real account; with Evergreen the token holds its own NEAR, stakes it in its own name, and pays its own yearly Rent from the rewards (principal never spent). A Steward contract is the NFT's owner and returns it, money and stake included, on `exit`. This is the project's core claim for the "NFTs That Do Something" track. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

## Verify it

Needs Node 22+ and pnpm. No Rust, no keys, no network accounts.

```bash
pnpm install
pnpm demo      # whole story in a local sandbox, ~2.5 min, exits non-zero if any claim fails
pnpm test      # 10 scenarios through the client against the same sandbox, ~3 min
```

`pnpm demo` prints `PASS`/`FAIL` per claim. What to look for: `alice.demo renewed itself 2 times`, `principal untouched`, `bob.demo is Reclaimable`.

## What is real and what is demo-only

- Real: the registry and wallet are the unmodified Top Level Accounts contracts, prebuilt from `contracts/upstream` (submodule pinned at `d85860a`). Checksums: `contracts/wasm/SHA256SUMS`. Rebuild and compare: `pnpm build:contracts` (needs Rust + cargo-near).
- New and unaudited: `contracts/steward`, `contracts/steward-factory`.
- Demo-only: 60-second Leases and Grace (real: 1 year / 14 days); `contracts/demo-pool` pays rewards on demand and releases unstaked funds at once (real pools: about 5% a year, 2-3 epoch delay).

## Layout

- `contracts/steward` Steward contract (Rust). `contracts/steward-factory` creates Stewards with one plain call (browser wallets). `contracts/demo-pool` demo pool. `contracts/spike` the original Rust go/no-go test.
- `packages/client` internal TypeScript client and the tests (`test/`). `packages/sandbox` deploys everything locally. `packages/cli` the `evergreen` command and the demo.
- `apps/web` the page (Next.js; see `apps/web/AGENTS.md` before editing): `/` the story, `/app` the real testnet app (NEAR Connect wallet), `/agents.md` + `/api/names?owner=` for agents.
- `packages/client/src/txs.ts` every user action as plain `{receiverId, actions}` transactions, shared by the app, CLI and tests.
- `deploy/` the hosted demo: a sandbox chain, keeper and read-only RPC gateway as systemd units on one VM, served over HTTPS by nginx (`deploy/README.md`). Never expose the sandbox RPC itself: its accounts share a public key. `testnet.json` + `pnpm evergreen testnet deploy` is the (unused, ~74 NEAR) testnet copy.

## Rules for changes

- Never modify `contracts/upstream`.
- Test through the client against the sandbox (`packages/client/test`); do not add other test seams.
- After changing a contract: `bash contracts/build.sh --update`, then `pnpm test`.
