//! Steward factory: creates a Steward with one plain function call, so any wallet can make a Name
//! Evergreen. Wallets refuse to let apps deploy code (Meteor) or do not know `UseGlobalContract`
//! (Meteor, MyNearWallet, HOT, Intear); here the factory does both on the user's behalf.
//!
//! Lives on the account that publishes the Steward as a global contract (by account id), and points
//! every new Steward at that code. The caller becomes the Steward's Patron; nobody else can.
//! NEW AND UNAUDITED.
use near_sdk::json_types::U64;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, Promise};

const INIT_GAS: Gas = Gas::from_tgas(30);
const CALLBACK_GAS: Gas = Gas::from_tgas(10);
/// Covers the Steward's own storage (global code, so only its state).
const MIN_DEPOSIT: NearToken = NearToken::from_millinear(300);

#[near(contract_state)]
#[derive(Default)]
pub struct Factory {}

/// `<label>-<8 hex>.<factory>`, or `<24 hex>.<factory>` when that would pass 64 chars.
/// The hex is sha256("<label>.<tla_id>:<patron>"), so each (Name, Patron) gets its own Steward.
pub fn derive_steward_id(factory: &AccountId, label: &str, tla_id: &AccountId, patron: &AccountId) -> AccountId {
    let hash = env::sha256(format!("{label}.{tla_id}:{patron}").as_bytes());
    let hex: String = hash.iter().map(|b| format!("{b:02x}")).collect();
    let short = format!("{label}-{}.{factory}", &hex[..8]);
    let id = if short.len() <= 64 { short } else { format!("{}.{factory}", &hex[..24]) };
    id.parse().expect("bad steward id")
}

#[near]
impl Factory {
    /// Creates the caller's Steward for `<label>.<tla_id>` holding the attached deposit, then calls
    /// its `new`. Next step: send it the Name with `nft_transfer_call`. If creation fails, the deposit
    /// goes back to the caller.
    #[payable]
    pub fn create_steward(
        &mut self,
        registry: AccountId,
        tla_id: AccountId,
        label: String,
        pool: AccountId,
        window_ns: U64,
        lapse_guard_ns: U64,
    ) -> Promise {
        let patron = env::predecessor_account_id();
        let deposit = env::attached_deposit();
        require!(deposit >= MIN_DEPOSIT, "deposit_below_0.3_near");
        let me = env::current_account_id();
        let id = derive_steward_id(&me, &label, &tla_id, &patron);
        let args = json!({
            "registry": registry, "tla_id": tla_id, "label": label, "pool": pool,
            "patron": patron, "window_ns": window_ns, "lapse_guard_ns": lapse_guard_ns,
        });
        Promise::new(id.clone())
            .create_account()
            .transfer(deposit)
            .use_global_contract_by_account_id(me.clone())
            .function_call("new".to_string(), args.to_string().into_bytes(), NearToken::from_yoctonear(0), INIT_GAS)
            .then(Self::ext(me).with_static_gas(CALLBACK_GAS).on_created(id, patron, deposit))
    }

    /// Returns the new Steward's account id, or refunds the caller and returns null.
    #[private]
    pub fn on_created(&mut self, id: AccountId, patron: AccountId, deposit: NearToken) -> Option<AccountId> {
        if env::promise_result_checked(0, 0).is_ok() {
            return Some(id);
        }
        Promise::new(patron).transfer(deposit).detach();
        None
    }

    /// The Steward account `create_steward` makes for `patron`.
    pub fn steward_id(&self, label: String, tla_id: AccountId, patron: AccountId) -> AccountId {
        derive_steward_id(&env::current_account_id(), &label, &tla_id, &patron)
    }
}
