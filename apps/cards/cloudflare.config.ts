import { bindings, defineConfig } from "cf/config";

// NFT card snapshots for link previews. Deploy: `pnpm --filter @evergreen-names/cards deploy`.
export default defineConfig({
  worker: {
    name: "evergreen-cards",
    entrypoint: "./src/index.ts",
    compatibilityDate: "2026-10-01",
    domains: ["cards.evergreennfts.space"],
    env: {
      CARDS: bindings.r2({ name: "evergreen-nft-cards" }),
      ORIGIN: bindings.text("https://evergreennfts.space"),
    },
  },
});
