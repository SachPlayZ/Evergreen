# For agents reviewing or working on Evergreen

Evergreen makes a NEAR Top Level Account Name (an NFT that is also an account) keep itself alive: a Steward contract owns the Name and pays its Rent from staking rewards. Terms: `GLOSSARY.md`. Decisions: `docs/adr/`.

## Verify it

Needs Node 22+ and pnpm. No Rust, no keys, no network accounts.

```bash
pnpm install
pnpm demo      # whole story in a local sandbox, ~2.5 min, exits non-zero if any claim fails
pnpm test      # 6 scenarios through the client against the same sandbox, ~2.5 min
```

`pnpm demo` prints `PASS`/`FAIL` per claim. What to look for: `alice.demo renewed itself 2 times`, `principal untouched`, `bob.demo is Reclaimable`.

## What is real and what is demo-only

- Real: the registry and wallet are the unmodified Top Level Accounts contracts, prebuilt from `contracts/upstream` (submodule pinned at `d85860a`). Checksums: `contracts/wasm/SHA256SUMS`. Rebuild and compare: `pnpm build:contracts` (needs Rust + cargo-near).
- New and unaudited: `contracts/steward`.
- Demo-only: 60-second Leases and Grace (real: 1 year / 14 days); `contracts/demo-pool` pays rewards on demand and releases unstaked funds at once (real pools: about 5% a year, 2-3 epoch delay).

## Layout

- `contracts/steward` Steward contract (Rust). `contracts/demo-pool` demo pool. `contracts/spike` the original Rust go/no-go test.
- `packages/client` internal TypeScript client and the tests (`test/`). `packages/sandbox` deploys everything locally. `packages/cli` the `evergreen` command and the demo.
- `apps/web` the status page (Next.js; see `apps/web/AGENTS.md` before editing).

## Rules for changes

- Never modify `contracts/upstream`.
- Test through the client against the sandbox (`packages/client/test`); do not add other test seams.
- After changing a contract: `bash contracts/build.sh --update`, then `pnpm test`.
