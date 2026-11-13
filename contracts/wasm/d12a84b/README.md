# Top Level Accounts contracts at d12a84b

The version House of Stake runs on testnet (`registry.hosdemo.testnet`). The testnet deploy
(`pnpm evergreen testnet deploy`) uses these so its wallets can run House of Stake's own published
wallet code (`impl.hosdemo.testnet`) instead of publishing a copy (43 NEAR burned).
`hos_wallet.wasm` is only for the sandbox rehearsal, which has no `impl.hosdemo.testnet`.

Built unmodified from `contracts/upstream` at `d12a84b` (`git archive d12a84b`, then
`cargo near build non-reproducible-wasm --locked --no-abi` in each contract). Non-reproducible:
other machines may produce different bytes.
