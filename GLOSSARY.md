# Evergreen

NEAR Top Level Account Names (NFTs that are live accounts) that keep themselves alive from their own stake and from supporters.

## Names

**Top Level Accounts**:
The NEAR system as a whole (registry plus shared wallet). Used only as the product/system name.
_Avoid_: TLA (when meaning a leased name)

**Namespace**:
A top-level account such as `bot` that issues Names beneath it. Either Open or Business.
_Avoid_: TLA, top-level name, registrar

**Name**:
A leased account under a Namespace, such as `alice.bot`; at once an NFT and a real account.
_Avoid_: sub-account, top-level name, domain, handle

**Owner**:
Whoever holds a Name's NFT (an account or a Steward); the only party able to make the Name act.
_Avoid_: holder, controller

**Patron**:
The person's account behind a Steward; it set the Steward up and may take the Name back.
_Avoid_: human owner, beneficiary

**Payout Account**:
The account that receives a Name's remaining NEAR and tokens when its Lease is reclaimed.

## Leases

**Lease**:
A Name's rental term and its current standing (Active, Grace, Reclaimable).
_Avoid_: subscription, registration

**Rent**:
The yearly price of a Lease, set in dollars and paid in NEAR at the registry rate.
_Avoid_: fee (except Business per-name fee), price

**Grace**:
The window after a Lease ends during which it can still be renewed.

**Reclaimable**:
The state after Grace in which the Name's assets are swept and anyone may rent it.
_Avoid_: expired, released

## Self-renewal

**Steward**:
A contract that is the Owner of a Name and renews its Lease from the Name's staking rewards.
_Avoid_: vault, keeper contract, guardian

**Keeper**:
Any off-chain process that nudges a Steward to act; holds no authority over the Name.
_Avoid_: bot, agent, cron

**Stake**:
NEAR the Name has delegated to a staking pool; the principal is never spent on Rent.

**Evergreen Name**:
A Name owned by a Steward, so it stays alive as long as its Stake or supporters cover Rent.
_Avoid_: immortal name, self-renewing NFT

**Tip**:
NEAR anyone sends to a Steward-owned Name, added to its Stake to keep it alive.
_Avoid_: donation

**Lifeline**:
Any payment by someone other than the Owner that keeps a Name alive, either a Tip or Rent paid directly.
_Avoid_: rescue, sponsorship

## Agents

**Agent Budget**:
A capped, expiring allowance a Name's wallet grants to another account, limited to listed receivers and plain transfers.
_Avoid_: spend grant, allowance, session key
