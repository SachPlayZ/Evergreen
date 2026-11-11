# A Steward contract owns the self-renewing Name

At `d85860a` an Agent Budget cannot call the registry, and only the Owner can make a Name stake, withdraw or pay Rent. So a keeper with a budget cannot renew from yield. We write one small Steward contract and make it the Name's Owner. Anyone can poke it to withdraw rewards and call the permissionless `renew_sub_account`. The registry and wallet contracts stay unmodified.

## Considered Options

- Keeper fronts rent and the human Owner signs periodic sweeps: rejected, because the Name does not really pay for itself.
- Pay-safely page only: kept as the fallback if the Steward fails.

## Consequences

- The Name must be transferred to the Steward while it holds no allow-listed tokens, because transfer is blocked otherwise.
- Overpaid rent lands in `pending_refunds` and the Steward must claim it.
- The NEAR/USD rate must be fresh (under 6 h) at renewal.
- The Steward must be a registered extension of the Name's wallet, not just its Owner.
- Reclaim sweeps only the Name account's own balance, not pool stake, so the Steward must never let a staked Name pass Grace.
