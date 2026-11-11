# Evergreen

**NEAR names now expire; this one keeps itself alive.**

Evergreen Names are NEAR Top Level Account Names (e.g. `alice.demo`) owned by a small Steward contract that pays the Name's yearly Rent from its own staking rewards. Anyone can send a Lifeline to keep a Name alive.

> Work in progress for the NEAR Hackathon (Nov 2026). Spec: the `ready-for-agent` issue. Terms: [GLOSSARY.md](GLOSSARY.md). Decisions: [docs/adr](docs/adr).

## Status

- Top Level Accounts contracts: third-party, unmodified, pinned at `d85860a` in `contracts/upstream` (own licence).
- Steward contract: new and **unaudited**.

## Layout

| Path | What |
| --- | --- |
| `packages/client` | Internal TypeScript client shared by CLI, web and Keeper |
| `packages/cli` | `evergreen` CLI, one command per demo step |
| `apps/web` | Living card, ICU page, "Make my Name Evergreen" |
| `contracts/steward` | Steward contract |
| `contracts/demo-pool` | Demo staking pool (accelerated rewards, demo only) |
| `contracts/upstream` | Top Level Accounts contracts (submodule) |
| `keeper/` | Keeper script |

## License

MIT, except `contracts/upstream` (upstream licence).
