import type { Metadata } from "next";
import { AppLoader } from "./AppLoader";
import "./app.css";

export const metadata: Metadata = {
  title: "Evergreen app: rent a NEAR Name that renews itself",
  description:
    "Connect a NEAR testnet wallet, rent a Name from House of Stake's registry, stake on it, and let its Steward pay the Rent from rewards. Agent prompt and JSON API included.",
  alternates: { canonical: "https://app.evergreennfts.space/" },
  openGraph: {
    type: "website",
    url: "https://app.evergreennfts.space/",
    siteName: "Evergreen",
    title: "Evergreen app: rent a NEAR Name that renews itself",
    description: "Rent a Name, stake on it, and let it pay its own Rent. NEAR testnet, Meteor and MyNearWallet.",
  },
};

export default function AppPage() {
  return <AppLoader />;
}
