//! Steward: owns one Evergreen Name and renews its Lease from staking rewards.
//! NEW AND UNAUDITED. Spike version: proves the self-renewal loop end to end.
//!
//! The Steward is the Name's Owner, so it is the only party the Name's wallet
//! obeys. Every action on the Name goes through `w_execute_extension`.
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::serde_json::{self, json, Value};
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const VIEW_GAS: Gas = Gas::from_tgas(10);
const POKE_CB_GAS: Gas = Gas::from_tgas(150);
const INNER_GAS: Gas = Gas::from_tgas(100);
const OUTER_GAS: Gas = Gas::from_tgas(120);
/// Unstake next Rent plus 10%: the registry refunds the excess.
const BUFFER_BPS: u128 = 1_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub enum Phase {
    Idle,
    Unstaking { amount: U128 },
    Withdrawing { amount: U128 },
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Renewal {
    pub at_ns: U64,
    pub paid_yocto: U128,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct StewardView {
    pub name: AccountId,
    pub patron: AccountId,
    pub pool: AccountId,
    pub principal: U128,
    pub tips: U128,
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
    window_ns: u64,
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
    ) -> Self {
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
            window_ns: window_ns.0,
            phase: Phase::Idle,
            renewals: Vec::new(),
        }
    }

    /// Patron stakes `amount` of the Name's own NEAR into the pool.
    pub fn stake(&mut self, amount: U128) -> Promise {
        require!(env::predecessor_account_id() == self.patron, "only_patron");
        self.principal += amount.0;
        self.exec(&self.pool.clone(), "deposit_and_stake", json!({}), amount.0, Gas::from_tgas(20))
    }

    /// Lifeline: anyone sends NEAR; it lands on the Name and is staked as principal.
    #[payable]
    pub fn tip(&mut self) -> Promise {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 1, "tip_too_small");
        let staked = amount - 1;
        self.principal += staked;
        self.tips += staked;
        let request = request(&self.pool, "deposit_and_stake", json!({}), staked, Gas::from_tgas(20));
        // One receipt, in order: the Tip arrives on the Name, then the Name stakes it.
        Promise::new(self.name.clone())
            .transfer(NearToken::from_yoctonear(staked))
            .function_call(
                "w_execute_extension".to_string(),
                serde_json::to_vec(&json!({ "request": request })).unwrap(),
                ONE_YOCTO,
                OUTER_GAS,
            )
    }

    /// Open to anyone. Reads the Lease, price and pool position, then advances one step.
    pub fn poke(&mut self) -> Promise {
        let a = Promise::new(self.registry.clone()).function_call(
            "get_sub_account".to_string(),
            args(json!({ "tla_id": self.tla_id, "name": self.label })),
            NearToken::from_yoctonear(0),
            VIEW_GAS,
        );
        let b = Promise::new(self.registry.clone()).function_call(
            "get_rent_price".to_string(),
            args(json!({ "tla_id": self.tla_id, "name": self.label })),
            NearToken::from_yoctonear(0),
            VIEW_GAS,
        );
        let c = Promise::new(self.pool.clone()).function_call(
            "get_account_staked_balance".to_string(),
            args(json!({ "account_id": self.name })),
            NearToken::from_yoctonear(0),
            VIEW_GAS,
        );
        let d = Promise::new(self.pool.clone()).function_call(
            "get_account_unstaked_balance".to_string(),
            args(json!({ "account_id": self.name })),
            NearToken::from_yoctonear(0),
            VIEW_GAS,
        );
        a.and(b).and(c).and(d).then(
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
        #[callback_unwrap] staked: U128,
        #[callback_unwrap] unstaked: U128,
    ) -> String {
        let expires: u64 = sub["expires_at"].as_str().unwrap().parse().unwrap();
        let rent: u128 = price["rent_yocto"].as_str().unwrap().parse().unwrap();
        let now = env::block_timestamp();
        if now.saturating_add(self.window_ns) < expires {
            return "not_due".into();
        }
        match self.phase.clone() {
            Phase::Idle => {
                let need = rent + rent * BUFFER_BPS / 10_000;
                let rewards = staked.0.saturating_sub(self.principal);
                if rewards < need {
                    return format!("insufficient_rewards:{rewards}<{need}");
                }
                self.phase = Phase::Unstaking { amount: U128(need) };
                self.exec(&self.pool.clone(), "unstake", json!({ "amount": U128(need) }), 0, Gas::from_tgas(20))
                    .detach();
                "unstaking".into()
            }
            Phase::Unstaking { amount } => {
                if unstaked.0 < amount.0 {
                    return "waiting_unstake".into();
                }
                self.phase = Phase::Withdrawing { amount };
                self.exec(&self.pool.clone(), "withdraw", json!({ "amount": amount }), 0, Gas::from_tgas(20))
                    .detach();
                "withdrawing".into()
            }
            Phase::Withdrawing { amount } => {
                if unstaked.0 >= amount.0 {
                    return "waiting_withdraw".into();
                }
                self.phase = Phase::Idle;
                self.renewals.push(Renewal { at_ns: U64(now), paid_yocto: amount });
                // Path (a): the Name itself pays the open renewal; excess goes to its pending_refunds.
                self.exec(
                    &self.registry.clone(),
                    "renew_sub_account",
                    json!({ "tla_id": self.tla_id, "name": self.label }),
                    amount.0,
                    INNER_GAS,
                )
                .detach();
                "renewing".into()
            }
        }
    }

    /// Pulls the Name's overpaid Rent back from the registry onto the Name.
    pub fn claim_refund(&mut self) -> Promise {
        self.exec(&self.registry.clone(), "claim_refund", json!({}), 0, Gas::from_tgas(30))
    }

    /// Patron takes the Name back.
    pub fn exit(&mut self) -> Promise {
        require!(env::predecessor_account_id() == self.patron, "only_patron");
        Promise::new(self.registry.clone()).function_call(
            "transfer_sub_account".to_string(),
            args(json!({ "tla_id": self.tla_id, "name": self.label, "new_owner": self.patron })),
            ONE_YOCTO,
            Gas::from_tgas(150),
        )
    }

    pub fn get_status(&self) -> StewardView {
        StewardView {
            name: self.name.clone(),
            patron: self.patron.clone(),
            pool: self.pool.clone(),
            principal: U128(self.principal),
            tips: U128(self.tips),
            phase: self.phase.clone(),
            renewals: self.renewals.clone(),
        }
    }
}

impl Steward {
    fn exec(&self, receiver: &AccountId, method: &str, call_args: Value, deposit: u128, gas: Gas) -> Promise {
        let request = request(receiver, method, call_args, deposit, gas);
        Promise::new(self.name.clone()).function_call(
            "w_execute_extension".to_string(),
            args(json!({ "request": request })),
            ONE_YOCTO,
            gas.saturating_add(Gas::from_tgas(30)),
        )
    }
}

fn args(v: Value) -> Vec<u8> {
    serde_json::to_vec(&v).unwrap()
}

/// The wallet's Request JSON: one external promise with one function call.
fn request(receiver: &AccountId, method: &str, call_args: Value, deposit: u128, gas: Gas) -> Value {
    use near_sdk::base64::Engine;
    let encoded = near_sdk::base64::engine::general_purpose::STANDARD.encode(args(call_args));
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
