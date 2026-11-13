//! Steward: owns one Evergreen Name and renews its Lease from staking rewards.
//! NEW AND UNAUDITED.
//!
//! The Steward is the Name's Owner, so it is the only party the Name's wallet
//! obeys. Every action on the Name goes through `w_execute_extension`.
//!
//! Facts this design rests on (houseofstake/tla-contracts @ d85860a, proven in
//! the sandbox spike):
//! - Results of calls made through the wallet do not come back here, so every
//!   `poke` re-reads the registry and the pool and advances one step.
//! - The wallet refuses its Owner once the Lease's expiry passes (Grace
//!   included), so all moves must finish BEFORE expiry.
//! - Reclaim sweeps only the Name's own NEAR. Stake left in a pool passes to
//!   the next renter. So if Rent cannot be covered, the Steward pulls the whole
//!   Stake back onto the Name before expiry ("evacuate"), where the sweep
//!   returns it to the Payout Account.
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, json, Value};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const NO_DEPOSIT: NearToken = NearToken::from_yoctonear(0);
const VIEW_GAS: Gas = Gas::from_tgas(8);
const POKE_CB_GAS: Gas = Gas::from_tgas(170);
const POOL_GAS: Gas = Gas::from_tgas(20);
const RENEW_GAS: Gas = Gas::from_tgas(100);
const WALLET_OVERHEAD_GAS: Gas = Gas::from_tgas(20);
/// Unstake next Rent plus 10%. The registry credits the excess back.
const BUFFER_BPS: u128 = 1_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Purpose {
    Renew,
    Evacuate,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum Phase {
    /// Nothing in flight.
    Idle,
    /// `unstake(amount)` was sent to the pool.
    Unstaking { amount: U128, purpose: Purpose },
    /// `withdraw(amount)` was sent; done once the pool's unstaked balance drops to `until`.
    Withdrawing { amount: U128, until: U128, purpose: Purpose },
    /// `renew_sub_account` was sent; done once the Lease's expiry passes `prev_expires`.
    Renewing { amount: U128, prev_expires: U64 },
    /// The whole Stake sits on the Name as plain NEAR. Restaked if the Lease is rescued.
    Evacuated { amount: U128 },
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Renewal {
    pub at_ns: U64,
    pub new_expires_ns: U64,
    pub rent_yocto: U128,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StewardView {
    pub name: AccountId,
    pub registry: AccountId,
    pub tla_id: AccountId,
    pub label: String,
    pub patron: AccountId,
    pub pool: AccountId,
    pub principal: U128,
    pub tips: U128,
    pub tip_count: u32,
    pub window_ns: U64,
    pub lapse_guard_ns: U64,
    pub phase: Phase,
    pub renewals: Vec<Renewal>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Steward {
    registry: AccountId,
    tla_id: AccountId,
    label: String,
    name: AccountId,
    pool: AccountId,
    patron: AccountId,
    /// Initial stake plus every Tip. Never spent on Rent.
    principal: u128,
    tips: u128,
    tip_count: u32,
    /// Renewal starts this long before expiry.
    window_ns: u64,
    /// If Rent is still not covered this long before expiry, evacuate the Stake.
    lapse_guard_ns: u64,
    phase: Phase,
    renewals: Vec<Renewal>,
}

#[near]
impl Steward {
    #[init]
    pub fn new(
        registry: AccountId,
        tla_id: AccountId,
        label: String,
        pool: AccountId,
        patron: AccountId,
        window_ns: U64,
        lapse_guard_ns: U64,
    ) -> Self {
        require!(lapse_guard_ns.0 < window_ns.0, "lapse_guard_must_be_inside_window");
        let name: AccountId = format!("{label}.{tla_id}").parse().expect("bad name");
        Self {
            registry,
            tla_id,
            label,
            name,
            pool,
            patron,
            principal: 0,
            tips: 0,
            tip_count: 0,
            window_ns: window_ns.0,
            lapse_guard_ns: lapse_guard_ns.0,
            phase: Phase::Idle,
            renewals: Vec::new(),
        }
    }

    /// Patron stakes `amount` of the Name's own NEAR into the pool.
    /// Fund the Name AFTER handing it to the Steward: the transfer sweeps its NEAR.
    pub fn stake(&mut self, amount: U128) -> Promise {
        require!(env::predecessor_account_id() == self.patron, "only_patron");
        require!(self.phase == Phase::Idle, "busy");
        self.principal += amount.0;
        self.exec(&self.pool.clone(), "deposit_and_stake", json!({}), amount.0, POOL_GAS)
    }

    /// Lifeline: anyone sends NEAR; it lands on the Name and is staked as principal.
    #[payable]
    pub fn tip(&mut self) -> Promise {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 1, "tip_too_small");
        require!(!matches!(self.phase, Phase::Evacuated { .. }), "evacuated");
        let staked = amount - 1;
        self.principal += staked;
        self.tips += staked;
        self.tip_count += 1;
        let request = request(&self.pool, "deposit_and_stake", json!({}), staked, POOL_GAS);
        // One receipt, in order: the Tip arrives on the Name, then the Name stakes it.
        Promise::new(self.name.clone())
            .transfer(NearToken::from_yoctonear(staked))
            .function_call(
                "w_execute_extension".to_string(),
                to_vec(json!({ "request": request })),
                ONE_YOCTO,
                POOL_GAS.saturating_add(WALLET_OVERHEAD_GAS),
            )
    }

    /// Open to anyone. Reads the Lease, Rent and pool position, then advances one step.
    /// Safe to call any number of times.
    pub fn poke(&mut self) -> Promise {
        let name_args = json!({ "tla_id": self.tla_id, "name": self.label });
        let acct_args = json!({ "account_id": self.name });
        view(&self.registry, "get_sub_account", name_args.clone())
            .and(view(&self.registry, "get_rent_price", name_args))
            .and(view(&self.registry, "get_pending_refund", acct_args.clone()))
            .and(view(&self.pool, "get_account_staked_balance", acct_args.clone()))
            .and(view(&self.pool, "get_account_unstaked_balance", acct_args.clone()))
            .and(view(&self.pool, "is_account_unstaked_balance_available", acct_args))
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(POKE_CB_GAS)
                    .on_poke(),
            )
    }

    #[private]
    pub fn on_poke(
        &mut self,
        #[callback_unwrap] sub: Value,
        #[callback_unwrap] price: Value,
        #[callback_unwrap] pending_refund: U128,
        #[callback_unwrap] staked: U128,
        #[callback_unwrap] unstaked: U128,
        #[callback_unwrap] available: bool,
    ) -> String {
        if sub.is_null() {
            return "name_gone".into();
        }
        if sub["owner"].as_str() != Some(env::current_account_id().as_str()) {
            return "not_owner".into();
        }
        let expires: u64 = sub["expires_at"].as_str().unwrap().parse().unwrap();
        let rent: u128 = price["rent_yocto"].as_str().unwrap().parse().unwrap();
        let now = env::block_timestamp();
        if now >= expires {
            // The wallet no longer obeys us. Only a direct renewal (a Lifeline) can help.
            return "lease_expired_needs_lifeline".into();
        }
        if pending_refund.0 > 0 {
            // Overpaid Rent comes back onto the Name as plain NEAR.
            self.exec(&self.registry.clone(), "claim_refund", json!({}), 0, Gas::from_tgas(30))
                .detach();
        }
        let guard_reached = now.saturating_add(self.lapse_guard_ns) >= expires;

        match self.phase.clone() {
            Phase::Idle => {
                if now.saturating_add(self.window_ns) < expires {
                    return "not_due".into();
                }
                let need = rent + rent * BUFFER_BPS / 10_000;
                let rewards = staked.0.saturating_sub(self.principal);
                if rewards >= need {
                    self.unstake(need, Purpose::Renew);
                    return "unstaking".into();
                }
                if guard_reached {
                    return self.evacuate(staked.0);
                }
                format!("insufficient_rewards:{rewards}<{need}")
            }
            Phase::Unstaking { amount, purpose } => {
                if unstaked.0 < amount.0 {
                    return "waiting_unstake".into();
                }
                if !available {
                    return "waiting_unstake_delay".into();
                }
                self.phase = Phase::Withdrawing {
                    amount,
                    until: U128(unstaked.0 - amount.0),
                    purpose,
                };
                self.exec(&self.pool.clone(), "withdraw", json!({ "amount": amount }), 0, POOL_GAS)
                    .detach();
                "withdrawing".into()
            }
            Phase::Withdrawing { amount, until, purpose } => {
                if unstaked.0 > until.0 {
                    return "waiting_withdraw".into();
                }
                match purpose {
                    Purpose::Renew => {
                        self.phase = Phase::Renewing { amount, prev_expires: U64(expires) };
                        self.renew(amount.0);
                        "renewing".into()
                    }
                    Purpose::Evacuate => {
                        self.phase = Phase::Evacuated { amount };
                        "evacuated".into()
                    }
                }
            }
            Phase::Renewing { amount, prev_expires } => {
                if expires > prev_expires.0 {
                    self.renewals.push(Renewal {
                        at_ns: U64(now),
                        new_expires_ns: U64(expires),
                        rent_yocto: U128(rent),
                    });
                    self.phase = Phase::Idle;
                    return "renewed".into();
                }
                if guard_reached {
                    // Renewal keeps failing (for example a stale rate). Protect the Stake.
                    return self.evacuate(staked.0);
                }
                self.renew(amount.0);
                "renewing_retry".into()
            }
            Phase::Evacuated { amount } => {
                // Someone renewed the Lease directly: put the Stake back to work.
                if now.saturating_add(self.window_ns) < expires {
                    self.phase = Phase::Idle;
                    self.exec(&self.pool.clone(), "deposit_and_stake", json!({}), amount.0, POOL_GAS)
                        .detach();
                    return "restaked".into();
                }
                "evacuated".into()
            }
        }
    }

    /// Patron takes the Name back. Stake in the pool stays with the Name, so it goes with it.
    /// The transfer sweeps the Name's plain NEAR to its Payout Account, which is this Steward since
    /// adoption, and a Steward cannot send NEAR on. So, in one atomic receipt, the Patron becomes
    /// the Payout Account first, then the Owner.
    pub fn exit(&mut self) -> Promise {
        require!(env::predecessor_account_id() == self.patron, "only_patron");
        Promise::new(self.registry.clone())
            .function_call(
                "set_payout_account".to_string(),
                to_vec(json!({ "tla_id": self.tla_id, "name": self.label, "new_payout_account": self.patron })),
                ONE_YOCTO,
                // The registry forwards 30 + 10 Tgas to the extension and its callback.
                Gas::from_tgas(60),
            )
            .function_call(
                "transfer_sub_account".to_string(),
                to_vec(json!({ "tla_id": self.tla_id, "name": self.label, "new_owner": self.patron })),
                ONE_YOCTO,
                Gas::from_tgas(150),
            )
    }

    pub fn get_status(&self) -> StewardView {
        StewardView {
            name: self.name.clone(),
            registry: self.registry.clone(),
            tla_id: self.tla_id.clone(),
            label: self.label.clone(),
            patron: self.patron.clone(),
            pool: self.pool.clone(),
            principal: U128(self.principal),
            tips: U128(self.tips),
            tip_count: self.tip_count,
            window_ns: U64(self.window_ns),
            lapse_guard_ns: U64(self.lapse_guard_ns),
            phase: self.phase.clone(),
            renewals: self.renewals.clone(),
        }
    }
}

impl Steward {
    fn unstake(&mut self, amount: u128, purpose: Purpose) {
        self.phase = Phase::Unstaking { amount: U128(amount), purpose };
        self.exec(&self.pool.clone(), "unstake", json!({ "amount": U128(amount) }), 0, POOL_GAS)
            .detach();
    }

    fn evacuate(&mut self, staked: u128) -> String {
        if staked == 0 {
            self.phase = Phase::Evacuated { amount: U128(0) };
            return "evacuated".into();
        }
        self.unstake(staked, Purpose::Evacuate);
        "evacuating".into()
    }

    /// The Name itself pays the open renewal. Excess is credited to its pending refunds.
    fn renew(&self, amount: u128) {
        self.exec(
            &self.registry.clone(),
            "renew_sub_account",
            json!({ "tla_id": self.tla_id, "name": self.label }),
            amount,
            RENEW_GAS,
        )
        .detach();
    }

    /// Makes the Name call `receiver.method` through its wallet.
    fn exec(&self, receiver: &AccountId, method: &str, call_args: Value, deposit: u128, gas: Gas) -> Promise {
        let request = request(receiver, method, call_args, deposit, gas);
        Promise::new(self.name.clone()).function_call(
            "w_execute_extension".to_string(),
            to_vec(json!({ "request": request })),
            ONE_YOCTO,
            gas.saturating_add(WALLET_OVERHEAD_GAS),
        )
    }
}

fn view(contract: &AccountId, method: &str, call_args: Value) -> Promise {
    Promise::new(contract.clone()).function_call(method.to_string(), to_vec(call_args), NO_DEPOSIT, VIEW_GAS)
}

fn to_vec(v: Value) -> Vec<u8> {
    serde_json::to_vec(&v).unwrap()
}

/// The wallet's Request JSON: one external promise with one function call.
fn request(receiver: &AccountId, method: &str, call_args: Value, deposit: u128, gas: Gas) -> Value {
    use near_sdk::base64::Engine;
    let encoded = near_sdk::base64::engine::general_purpose::STANDARD.encode(to_vec(call_args));
    json!({ "external": [{
        "receiver_id": receiver,
        "actions": [{ "action": "function_call", "payload": {
            "function_name": method,
            "args": encoded,
            "deposit": deposit.to_string(),
            "gas": gas.as_gas().to_string(),
        }}]
    }]})
}
