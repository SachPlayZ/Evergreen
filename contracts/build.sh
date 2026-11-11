#!/usr/bin/env bash
# Rebuilds every contract from source and compares it with the prebuilt wasm in contracts/wasm.
# Needs: rustup (toolchain from rust-toolchain.toml) and cargo-near (`cargo install --locked cargo-near`).
# Upstream contracts are built from the pinned submodule, unmodified.
# These are non-reproducible builds: a different OS or toolchain can produce different bytes.
# A mismatch is reported, not hidden. Pass --update to overwrite contracts/wasm with the fresh build.
set -euo pipefail
cd "$(dirname "$0")"

UPSTREAM=(contracts/hos-wallet contracts/wallet-impl-deployer contracts/registrar contracts/hos-extension contracts/mpc-recovery contracts/tla-registry)
OURS=(steward demo-pool)
OUT=$(mktemp -d)

for c in "${UPSTREAM[@]}"; do
  echo "== upstream/$c"
  (cd "upstream/$c" && cargo near build non-reproducible-wasm --locked --no-abi >/dev/null 2>&1)
  n=$(basename "$c" | tr - _)
  cp "upstream/target/near/$n/$n.wasm" "$OUT/"
done
for c in "${OURS[@]}"; do
  echo "== $c"
  (cd "$c" && cargo near build non-reproducible-wasm --locked --no-abi >/dev/null 2>&1)
  n=$(echo "$c" | tr - _)
  cp "target/near/$n/$n.wasm" "$OUT/"
done

if [ "${1:-}" = "--update" ]; then
  cp "$OUT"/*.wasm wasm/
  (cd wasm && shasum -a 256 *.wasm > SHA256SUMS)
  echo "contracts/wasm updated."
  exit 0
fi

echo "== comparing with contracts/wasm/SHA256SUMS"
if (cd "$OUT" && shasum -a 256 -c "$OLDPWD/wasm/SHA256SUMS"); then
  echo "All contracts match the prebuilt wasm."
else
  echo "Some builds differ from the prebuilt wasm (expected across machines for non-reproducible builds)."
  exit 1
fi
