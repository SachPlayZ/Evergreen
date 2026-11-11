//! Go/no-go spike for Evergreen (11 Nov 2026).
//! P1: a Steward contract can become a Name's Owner and drive its wallet.
//! P2: the Name pays its own renewal (payment path a), funded only by staking rewards.
//! P3: what happens to stake left in a pool when a staked Name lapses and is re-rented.
mod common;

use anyhow::{bail, Result};
use common::*;
use defuse_wallet::actions::FunctionCall;
use defuse_wallet::{NearPromise, Request};
use near_sdk::json_types::{U128, U64};
use near_workspaces::types::NearToken;
use near_workspaces::{AccountId, Contract};
use serde_json::{json, Value};

const SHORT_TERM_NS: u64 = 60 * 1_000_000_000;

fn own_wasm(name: &str) -> Vec<u8> {
    let path = format!("../target/near/{name}/{name}.wasm");
    std::fs::read(&path).unwrap_or_else(|e| panic!("read {path}: {e}"))
}

async fn deploy_own(fleet: &Fleet, sub: &str, artifact: &str) -> Result<Contract> {
    let account = fleet
        .relay
        .create_subaccount(sub)
        .initial_balance(NearToken::from_near(10))
        .transact()
        .await?
        .into_result()?;
    Ok(account.deploy(&own_wasm(artifact)).await?.into_result()?)
}

async fn lease(fleet: &Fleet, registry: &Contract, tla: &AccountId, name: &str) -> Result<Value> {
    let v: Value = registry
        .view("get_sub_account")
        .args_json(json!({ "tla_id": tla, "name": name }))
        .await?
        .json()?;
    let _ = fleet;
    Ok(v)
}

fn expires(v: &Value) -> u64 {
    v["expires_at"].as_str().unwrap().parse().unwrap()
}

async fn staked(pool: &Contract, who: &AccountId) -> Result<u128> {
    let v: U128 = pool
        .view("get_account_staked_balance")
        .args_json(json!({ "account_id": who }))
        .await?
        .json()?;
    Ok(v.0)
}

fn near(y: u128) -> String {
    format!("{:.3} NEAR", y as f64 / 1e24)
}

#[tokio::test]
async fn p1_p2_steward_renews_the_name_from_rewards_only() -> Result<()> {
    let fleet = deploy_fleet().await?;
    let registry = deploy_registry_with_terms(&fleet, Some(SHORT_TERM_NS), SHORT_TERM_NS).await?;
    let tla = fleet.registrar.id().clone();
    let label = "evergreen";

    // Bob rents a Name and funds it.
    let name = rent(&fleet, &registry, &tla, label).await?;
    fleet.relay.transfer_near(&name, NearToken::from_near(1)).await?.into_result()?;

    let pool = deploy_own(&fleet, "pool", "demo_pool").await?;
    pool.call("new").transact().await?.into_result()?;
    let steward = deploy_own(&fleet, "steward", "steward").await?;
    steward
        .call("new")
        .args_json(json!({
            "registry": registry.id(), "tla_id": tla, "label": label, "pool": pool.id(),
            "patron": fleet.bob.id(), "window_ns": U64(10 * SHORT_TERM_NS),
        }))
        .transact()
        .await?
        .into_result()?;

    println!("Name balance before transfer = {}", near(balance_of(&fleet.worker, &name).await?));
    // P1: Bob hands the Name to the Steward.
    let out = fleet
        .bob
        .call(registry.id(), "transfer_sub_account")
        .args_json(json!({ "tla_id": tla, "name": label, "new_owner": steward.id() }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?;
    if !out.is_success() || !out.receipt_failures().is_empty() {
        bail!("P1 transfer to Steward failed: {:#?}", out.receipt_failures());
    }
    println!("Name balance after transfer = {}", near(balance_of(&fleet.worker, &name).await?));
    // Finding: transfer sweeps the Name's NEAR, so the Patron funds the Name AFTER adoption.
    fleet.bob.transfer_near(&name, NearToken::from_near(40)).await?.into_result()?;
    let exts: Vec<String> = fleet.worker.view(&name, "w_extensions").await?.json()?;
    let owner = lease(&fleet, &registry, &tla, label).await?["owner"].clone();
    println!("P1 registry owner = {owner}, wallet extensions = {exts:?}");
    assert_eq!(owner, json!(steward.id()), "registry owner is not the Steward");
    assert!(exts.iter().any(|e| e == steward.id().as_str()), "Steward is not a wallet extension");

    // Patron stakes 30 NEAR of the Name's own NEAR through the Steward.
    let principal = NearToken::from_near(30).as_yoctonear();
    let out = fleet
        .bob
        .call(steward.id(), "stake")
        .args_json(json!({ "amount": U128(principal) }))
        .max_gas()
        .transact()
        .await?;
    if !out.receipt_failures().is_empty() {
        bail!("stake via Steward failed: {:#?}", out.receipt_failures());
    }
    assert_eq!(staked(&pool, &name).await?, principal, "P1: Steward could not make the Name stake");
    println!("P1 OK: Steward drives the Name (staked {})", near(principal));

    // Tip (Lifeline) from a stranger adds to principal.
    let out = fleet.relay.call(steward.id(), "tip").deposit(NearToken::from_near(2)).max_gas().transact().await?;
    if !out.receipt_failures().is_empty() {
        bail!("tip failed: {:#?}", out.receipt_failures());
    }
    let principal = principal + NearToken::from_near(2).as_yoctonear() - 1;
    assert_eq!(staked(&pool, &name).await?, principal, "tip was not staked");
    println!("TIP OK: stake now {}", near(principal));

    // Demo pool drips rewards (DEMO ONLY).
    pool.as_account()
        .call(pool.id(), "drip_reward")
        .args_json(json!({ "account_id": name }))
        .deposit(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    let before = expires(&lease(&fleet, &registry, &tla, label).await?);
    let rent_now: Value = registry.view("get_rent_price").args_json(json!({"tla_id": tla, "name": label})).await?.json()?;
    println!("Rent per term = {}", near(rent_now["rent_yocto"].as_str().unwrap().parse()?));

    // Anyone pokes. Three steps: unstake, withdraw, renew.
    let mut statuses = vec![];
    for _ in 0..4 {
        let out = fleet.relay.call(steward.id(), "poke").max_gas().transact().await?;
        if !out.receipt_failures().is_empty() {
            bail!("poke receipt failed: {:#?}", out.receipt_failures());
        }
        let s: String = out.json()?;
        statuses.push(s.clone());
        if s == "renewing" {
            break;
        }
    }
    println!("POKES: {statuses:?}");
    let after = expires(&lease(&fleet, &registry, &tla, label).await?);
    let stake_after = staked(&pool, &name).await?;
    println!(
        "P2 expiry {} -> {} (+{}s); staked {} (principal {})",
        before, after, (after.saturating_sub(before)) / 1_000_000_000, near(stake_after), near(principal)
    );
    assert!(after > before, "P2: Lease did not move forward");
    assert!(stake_after >= principal, "P2: principal was spent");

    // Overpaid rent comes back to the Name.
    let refund: U128 = registry.view("get_pending_refund").args_json(json!({"account_id": name})).await.map(|r| r.json().unwrap()).unwrap_or(U128(0));
    println!("pending refund for Name = {}", near(refund.0));

    // Patron exits and gets the Name back.
    let out = fleet.bob.call(steward.id(), "exit").max_gas().transact().await?;
    if !out.receipt_failures().is_empty() {
        bail!("exit failed: {:#?}", out.receipt_failures());
    }
    let owner = lease(&fleet, &registry, &tla, label).await?["owner"].clone();
    assert_eq!(owner, json!(fleet.bob.id()), "exit did not return the Name");
    println!("EXIT OK: Name back with Patron");
    Ok(())
}

#[tokio::test]
async fn p3_stake_left_in_a_pool_goes_to_the_next_renter() -> Result<()> {
    let fleet = deploy_fleet().await?;
    let registry = deploy_registry_with_terms(&fleet, Some(SHORT_TERM_NS), SHORT_TERM_NS).await?;
    let tla = fleet.registrar.id().clone();
    let label = "lapser";
    let name = rent(&fleet, &registry, &tla, label).await?;
    fleet.relay.transfer_near(&name, NearToken::from_near(10)).await?.into_result()?;
    let pool = deploy_own(&fleet, "pool", "demo_pool").await?;
    pool.call("new").transact().await?.into_result()?;

    let call = |method: &str, args: Value, deposit: u128| {
        let id: near_sdk::AccountId = pool.id().as_str().parse().unwrap();
        Request::new().external([NearPromise::new(id).function_call(
            FunctionCall::name(method)
                .args(serde_json::to_vec(&args).unwrap())
                .gas(near_sdk::Gas::from_tgas(20))
                .attach_deposit(near_sdk::NearToken::from_yoctonear(deposit)),
        )])
    };
    let stake = NearToken::from_near(5).as_yoctonear();
    fleet.bob.call(&name, "w_execute_extension")
        .args_json(json!({ "request": call("deposit_and_stake", json!({}), stake) }))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?.into_result()?;
    assert_eq!(staked(&pool, &name).await?, stake);

    let bob_before = balance_of(&fleet.worker, fleet.bob.id()).await?;
    fleet.worker.fast_forward(4_000).await?;
    let out = fleet.relay.call(registry.id(), "reclaim_finalize")
        .args_json(json!({ "tla_id": tla, "name": label })).max_gas().transact().await?;
    if !out.receipt_failures().is_empty() {
        bail!("reclaim failed: {:#?}", out.receipt_failures());
    }
    let price = rent_price(&registry, &tla, label).await?;
    fleet.relay.call(registry.id(), "rent_sub_account")
        .args_json(json!({ "tla_id": tla, "name": label }))
        .deposit(NearToken::from_yoctonear(price)).max_gas().transact().await?.into_result()?;
    println!("after re-rent: stake still under Name = {}", near(staked(&pool, &name).await?));

    // The NEW renter (relay) unstakes and withdraws the OLD renter's stake.
    fleet.relay.transfer_near(&name, NearToken::from_near(1)).await?.into_result()?;
    let r1 = fleet.relay.call(&name, "w_execute_extension")
        .args_json(json!({ "request": call("unstake", json!({"amount": U128(stake)}), 0) }))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?;
    let before = balance_of(&fleet.worker, &name).await?;
    let r2 = fleet.relay.call(&name, "w_execute_extension")
        .args_json(json!({ "request": call("withdraw", json!({"amount": U128(stake)}), 0) }))
        .deposit(NearToken::from_yoctonear(1)).max_gas().transact().await?;
    let after = balance_of(&fleet.worker, &name).await?;
    println!("P3 unstake failures: {:?}", r1.receipt_failures().iter().map(|f| { let d = format!("{:?}", f); d.find("ExecutionError").map(|i| d[i..].chars().take(160).collect::<String>()).unwrap_or(d.chars().take(200).collect()) }).collect::<Vec<_>>());
    println!("P3 stake under Name now = {}", near(staked(&pool, &name).await?));
    let bob_after = balance_of(&fleet.worker, fleet.bob.id()).await?;
    println!(
        "P3 new renter unstake ok={} withdraw ok={}; Name balance +{}; old renter balance change {}",
        r1.receipt_failures().is_empty(), r2.receipt_failures().is_empty(),
        near(after.saturating_sub(before)),
        (bob_after as i128 - bob_before as i128) as f64 / 1e24
    );
    assert!(r1.receipt_failures().is_empty() && r2.receipt_failures().is_empty(), "P3: new renter could NOT take the old stake");
    println!("P3 CONFIRMED: stake left in a pool passes to the next renter");
    Ok(())
}
