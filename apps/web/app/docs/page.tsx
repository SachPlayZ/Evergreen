import type { Metadata } from "next";
import { APP_URL, SITE } from "@/lib/site";
import { UseIt } from "../components/UseIt";

const REPO = "https://github.com/SachPlayZ/Evergreen";

export const metadata: Metadata = {
  title: "Evergreen docs: make your own Name Evergreen",
  description: "Make a NEAR testnet Name pay its own Rent: adopt it with a Steward, check on it, and take it back, from the terminal.",
  alternates: { canonical: "https://docs.evergreennfts.space/" },
};

export default function DocsPage() {
  return (
    <>
      <nav className="nav" aria-label="Main">
        <a className="wordmark" href={SITE}>
          Evergreen
        </a>
        <div className="nav-links">
          <a href={SITE}>Home</a>
          <a className="nav-cta" href={APP_URL}>
            Open app
          </a>
          <a href={REPO}>GitHub</a>
        </div>
      </nav>
      <main>
        <UseIt />
      </main>
    </>
  );
}
