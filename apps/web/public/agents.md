# Evergreen: agent guide

Use this to manage NEAR Names (Top Level Accounts) on **NEAR testnet** with Evergreen: rent a Name, make it renew itself from staking rewards, and manage its NEAR and Stake. Human UI for the same actions: https://evergreen-names.vercel.app/app

- Evergreen is **not** the rental service. Names are leased from House of Stake's Top Level Accounts registry (https://github.com/houseofstake/tla-contracts). On testnet that registry is an unmodified copy at `registry.sachindraz.testnet`, because House of Stake's own testnet registry is paused (stale price oracle).
- Testnet only. The Steward contract is new and unaudited.

## Constants

| What | Value |
| --- | --- |
| RPC | `https://test.rpc.fastnear.com` |
| Registry | `registry.sachindraz.testnet` |
| Namespace (open, anyone may rent) | `ev.sachindraz.testnet` → Names look like `mybot.ev.sachindraz.testnet` |
| Staking pool | `aurora.pool.f863973.m0` |
| Steward code (NEAR global contract) | `evergreen-steward.testnet` |
| Steward account for a Name | `ev-<label>-ev-sachindraz-testnet.<owner>` e.g. `ev-mybot-ev-sachindraz-testnet.you.testnet` |
| Renewal window / lapse guard | 30 days / 3 days before expiry |
| Explorer | `https://testnet.nearblocks.io/address/<account>` |

## Read state (always do this first)

```bash
curl -s "https://evergreen-names.vercel.app/api/names?owner=you.testnet"
```

Returns every Name `you.testnet` holds (directly, or through its own Steward): `status`, `secondsLeft`, `balanceYocto` (plain NEAR on the Name), `evergreen`, `steward` (`phase`, `principalYocto`, `stakedYocto`, `rewardsYocto`, `needYocto`, `renewals`), and `pool` (the Name's position in the pool, also after you take it back). 1 NEAR = 10^24 yocto.

Direct views (no signing):

| Question | Contract · method · args |
| --- | --- |
| Is a Name free? Lease? | `registry.sachindraz.testnet` · `get_sub_account` · `{"tla_id":"ev.sachindraz.testnet","name":"mybot"}` (null = free) |
| Price | `registry.sachindraz.testnet` · `get_rent_price` · same args → `{rent_yocto, creation_deposit_yocto, total_yocto}` |
| Names by direct owner | `registry.sachindraz.testnet` · `list_sub_accounts_by_owner` · `{"owner":"you.testnet","from_index":0,"limit":50}` |
| Steward state | `<steward>` · `get_status` · `{}` |
| Pool position | `aurora.pool.f863973.m0` · `get_account_staked_balance` / `get_account_unstaked_balance` / `is_account_unstaked_balance_available` · `{"account_id":"<name>"}` |
| Overpaid Rent owed to you | `registry.sachindraz.testnet` · `get_pending_refund` · `{"account_id":"you.testnet"}` |

```bash
near contract call-function as-read-only registry.sachindraz.testnet get_rent_price json-args '{"tla_id":"ev.sachindraz.testnet","name":"mybot"}' network-config testnet now
```

## Act

Easiest: the CLI in https://github.com/SachPlayZ/Evergreen (`pnpm install` once; signs with `~/.near-credentials/testnet/you.testnet.json`):

```bash
pnpm evergreen testnet rent mybot --account you.testnet
pnpm evergreen testnet adopt mybot --account you.testnet --stake 3   # rent first if free, then make it Evergreen
pnpm evergreen testnet status mybot
pnpm evergreen testnet poke mybot --account you.testnet
pnpm evergreen testnet tip mybot 1 --account you.testnet
pnpm evergreen testnet exit mybot --account you.testnet
```

Or raw transactions (near-cli-rs: `near contract call-function as-transaction <receiver> <method> json-args '<json>' prepaid-gas '<gas>' attached-deposit '<deposit>' sign-as you.testnet network-config testnet sign-with-legacy-keychain send`):

| Action | Who | Receiver | Method · args | Deposit · gas |
| --- | --- | --- | --- | --- |
| Rent | anyone | registry | `rent_sub_account` · `{"tla_id":"ev.sachindraz.testnet","name":"mybot"}` | `total_yocto` from `get_rent_price` · 300 Tgas |
| Pay Rent (manual renewal) | anyone | registry | `renew_sub_account` · same | `rent_yocto` · 150 Tgas |
| Transfer Name | owner | registry | `transfer_sub_account` · `{"tla_id","name","new_owner"}` | 1 yocto · 150 Tgas |
| Claim overpaid Rent | anyone owed | registry | `claim_refund` · `{}` | 0 · 30 Tgas |
| Poke (advance renewal) | anyone | steward | `poke` · `{}` | 0 · 300 Tgas |
| Tip / add to Stake | anyone | steward | `tip` · `{}` | amount · 100 Tgas |
| Take the Name back | patron | steward | `exit` · `{}` | 0 · 300 Tgas |
| Send NEAR out of the Name | owner | the Name | `w_execute_extension` · `{"request":{"external":[{"receiver_id":"you.testnet","actions":[{"action":"transfer","payload":{"amount":"<yocto>"}}]}]}}` | 1 yocto · 30 Tgas |
| Unstake the Name's Stake | owner (after exit) | the Name | `w_execute_extension` with a `function_call` action: `{"action":"function_call","payload":{"function_name":"unstake_all","args":"e30=","deposit":"0","gas":"30000000000000"}}`, receiver the pool | 1 yocto · 50 Tgas |
| Withdraw from pool (~4 epochs later) | owner | the Name | same, `function_name":"withdraw"`, `args` = base64 of `{"amount":"<unstaked yocto>"}` | 1 yocto · 50 Tgas |

**Make it Evergreen** = four transactions, in this order, signed by the current owner (the patron):

1. To `ev-mybot-ev-sachindraz-testnet.you.testnet`: `CreateAccount`, `Transfer` 0.3 NEAR, `UseGlobalContract {accountId: "evergreen-steward.testnet"}`, `FunctionCall new {"registry":"registry.sachindraz.testnet","tla_id":"ev.sachindraz.testnet","label":"mybot","pool":"aurora.pool.f863973.m0","patron":"you.testnet","window_ns":"2592000000000000","lapse_guard_ns":"259200000000000"}` (30 Tgas).
2. Registry `transfer_sub_account` to the Steward (1 yocto).
3. `Transfer` stake + 0.5 NEAR to the Name (after step 2: a transfer sweeps the Name's NEAR).
4. Steward `stake {"amount":"<stake yocto>"}` (100 Tgas, patron only).

Code for all of these as plain `{receiverId, actions}`: `packages/client/src/txs.ts` in the repo.

## Rules for agents

1. Testnet only. Never use mainnet accounts or keys.
2. Read state first. Before any transaction, tell the user: receiver, method, NEAR amount, and what changes.
3. Ask before anything that moves NEAR or ownership (rent, adopt, tip, renew, exit, transfer, withdraw, unstake). Reads and `poke` need no approval.
4. Never transfer a Name or send NEAR to an account the user did not name.
5. Evergreen Names renew themselves. Pay Rent by hand only if the Steward `phase` is `Evacuated` or the Lease is in Grace.
6. After `exit`, the Stake is still the Name's, in the pool: `unstake_all`, wait ~4 epochs (~2 days, `is_account_unstaked_balance_available` = true), `withdraw`, then send NEAR out of the Name.
7. To make a Name Evergreen again after `exit`, transfer it back to its existing Steward (don't create a second one).
