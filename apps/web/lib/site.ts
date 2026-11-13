/** Public URLs. One Next.js app on Vercel serves all three hosts (next.config.ts rewrites by host). */
export const SITE = "https://evergreennfts.space";
export const APP_URL = "https://app.evergreennfts.space";
export const DOCS_URL = "https://docs.evergreennfts.space";
/** Snapshots of NFT cards in R2, served by the `evergreen-cards` Worker (deploy/cards). */
export const CARDS_URL = "https://cards.evergreennfts.space";
export const REPO = "https://github.com/SachPlayZ/Evergreen";

/** A shareable page for one Name; X shows its card (from R2) as the preview image. */
export const sharePage = (label: string) => `${SITE}/nft/${label}`;
export const cardImage = (label: string) => `${CARDS_URL}/${label}.png`;
