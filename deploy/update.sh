#!/usr/bin/env bash
# Brings the VM to origin/main and restarts what changed. Run by CI over SSH with a key that can run
# nothing else (authorized_keys: command="/home/ubuntu/evergreen/deploy/update.sh",restrict ...).
# Never restarts evergreen-chain: that would reset the demo. Safe to run twice.
set -euo pipefail

# Everything lives in main so bash has read the whole script before git pull rewrites this file.
main() {
  cd "$(dirname "$0")/.."
  local before after
  before=$(git rev-parse HEAD)
  git fetch -q origin main
  git reset -q --hard origin/main
  after=$(git rev-parse HEAD)
  echo "evergreen: ${before:0:7} -> ${after:0:7}"

  if git diff --quiet "$before" "$after" -- pnpm-lock.yaml package.json 'packages/*/package.json'; then
    echo "deps unchanged"
  else
    pnpm install --frozen-lockfile --silent
  fi

  if ! git diff --quiet "$before" "$after" -- 'deploy/*.service'; then
    sudo cp deploy/*.service /etc/systemd/system/
    sudo systemctl daemon-reload
    echo "systemd units updated"
  fi

  local units=(evergreen-keeper evergreen-testnet-keeper evergreen-gateway)
  sudo systemctl restart "${units[@]}"
  sleep 20
  for u in "${units[@]}"; do
    printf '%s: %s\n' "$u" "$(systemctl is-active "$u")"
  done
  journalctl -u evergreen-testnet-keeper -n 6 --no-pager -o cat
  for u in "${units[@]}"; do systemctl is-active --quiet "$u"; done
}

main "$@"
exit
