#!/usr/bin/env bash
# One-time: lets GitHub Actions deploy the keeper. Run from your machine:
#   bash deploy/setup-ci.sh <your-vm-ssh-key> ubuntu@<vm-ip>
# Makes a new SSH key that can ONLY run deploy/update.sh on the VM (forced command + restrict),
# then stores it, the host and the VM's host key as GitHub secrets for .github/workflows/deploy-keeper.yml.
set -euo pipefail
ADMIN_KEY=${1:?path to your VM ssh key}
HOST=${2:?user@host of the VM}
TMP=$(mktemp -d) && trap 'rm -rf "$TMP"' EXIT

ssh-keygen -q -t ed25519 -N "" -C evergreen-ci-deploy -f "$TMP/key"
ssh -i "$ADMIN_KEY" "$HOST" "cd ~/evergreen && git pull -q --ff-only && chmod +x deploy/update.sh \
  && { grep -v evergreen-ci-deploy ~/.ssh/authorized_keys || true; } > ~/.ssh/ak.tmp \
  && echo 'command=\"/home/ubuntu/evergreen/deploy/update.sh\",restrict $(cat "$TMP/key.pub")' >> ~/.ssh/ak.tmp \
  && chmod 600 ~/.ssh/ak.tmp && mv ~/.ssh/ak.tmp ~/.ssh/authorized_keys"
ssh-keyscan -t ed25519 "${HOST#*@}" 2>/dev/null > "$TMP/known_hosts"

gh secret set KEEPER_SSH_KEY < "$TMP/key"
gh secret set KEEPER_KNOWN_HOSTS < "$TMP/known_hosts"
gh secret set KEEPER_HOST --body "$HOST"
echo "Done. Test it: gh workflow run deploy-keeper.yml && gh run watch"
