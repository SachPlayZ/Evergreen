/**
 * evergreennfts.space/nft/<label>: the page people share. X and other previews show the Name's card,
 * snapshotted in R2 (cards.evergreennfts.space). The page itself shows the live card.
 */
import type { Metadata } from "next";
import { APP_URL, SITE, cardImage, sharePage } from "@/lib/site";
import { NET, explorerAccount, validLabel } from "@/lib/testnet";
import "../../app/app.css";

type Props = { params: Promise<{ label: string }> };

// Blocking on purpose: link-preview crawlers (X) need the og:image in the first HTML, not a stream.
export const instant = false;

const clean = (raw: string) => {
  const label = decodeURIComponent(raw).toLowerCase().replace(new RegExp(`\\.${NET.namespace.replace(/\./g, "\\.")}$`), "");
  return validLabel(label) ? label : null;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const label = clean((await params).label);
  if (!label) return { title: "Evergreen NFT" };
  const title = `${label}: an NFT that pays its own rent`;
  const description = `${label}.${NET.namespace} is a NEAR Name (a NEP-171 NFT that is also an account). It stakes its own NEAR and renews itself from the rewards. Principal never spent.`;
  const image = { url: cardImage(label), width: 1200, height: 630, alt: `Live card of ${label}.${NET.namespace}` };
  return {
    title,
    description,
    alternates: { canonical: sharePage(label) },
    openGraph: { title, description, url: sharePage(label), siteName: "Evergreen", type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharePage({ params }: Props) {
  const label = clean((await params).label);
  if (!label) {
    return (
      <main className="app">
        <p>Not a Name.</p>
      </main>
    );
  }
  const name = `${label}.${NET.namespace}`;
  return (
    <main className="app share">
      <header className="app-bar">
        <a className="wordmark" href={SITE}>
          Evergreen
        </a>
        <span className="net-badge">Testnet</span>
      </header>
      <section className="app-intro">
        <h1>
          This NFT <em>pays its own rent.</em>
        </h1>
        <p className="section-lede">
          <code>{name}</code> is a NEAR Name: a NEP-171 token that is also a real account. It stakes its own NEAR, earns,
          and renews its own Lease from the rewards. The principal is never spent.
        </p>
      </section>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="nft-card-img" src={`/api/nft/${label}.png`} alt={`Live card of ${name}`} width={1200} height={630} />
      <p className="use-cta">
        <a className="btn" href={APP_URL}>
          Make yours
        </a>
        <a href={`${APP_URL}/?account=${encodeURIComponent(name)}`}>Open in the app</a>
        <a href={explorerAccount(name)} target="_blank" rel="noreferrer">
          See it on chain
        </a>
      </p>
    </main>
  );
}
