# deploy

The hosted demo runs on one small Linux VM: the demo chain, the keeper, and a read-only gateway.
The web page on Vercel reads the chain through the gateway, which nginx serves over HTTPS (`nginx-evergreen.conf`).

```bash
git clone https://github.com/SachPlayZ/Evergreen.git ~/evergreen && cd ~/evergreen && pnpm install
sudo cp deploy/*.service /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable --now evergreen-chain evergreen-keeper evergreen-gateway
sudo cp deploy/nginx-evergreen.conf /etc/nginx/sites-enabled/evergreen && sudo certbot --nginx -d <vm-ip-dashed>.sslip.io
journalctl -u evergreen-keeper -f
```

Vercel env: `EVERGREEN_RPC_URL=https://<vm-ip-dashed>.sslip.io`, `EVERGREEN_REGISTRY_ID=registry`, `EVERGREEN_NAMESPACE=demo`,
`EVERGREEN_TERM_SECS=60`, `EVERGREEN_NETWORK_LABEL=demo chain`.

`pnpm evergreen testnet deploy --account <you.testnet>` deploys the same stack to testnet instead
(about 74 testnet NEAR, mostly the wallet code published as a global contract).
