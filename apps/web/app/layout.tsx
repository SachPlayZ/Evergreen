import type { Metadata } from "next";
import { Geist, Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const display = Newsreader({ variable: "--font-display", subsets: ["latin"], style: ["normal", "italic"] });
const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const title = "Evergreen: NEAR names that keep themselves alive";
const description =
  "NEAR names now expire. An Evergreen Name is owned by a Steward contract that pays its yearly Rent from its own staking rewards.";

// Icons and share images come from the app/ file conventions (icon.png, apple-icon.png, favicon.ico,
// opengraph-image.png, twitter-image.png), rendered by scripts/brand.mjs.
export const metadata: Metadata = {
  metadataBase: new URL("https://evergreen-names.vercel.app"),
  title,
  description,
  applicationName: "Evergreen",
  keywords: ["NEAR", "Top Level Accounts", "NFT", "staking", "House of Stake", "names"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Evergreen",
    title,
    description,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport = { themeColor: "#070a06", colorScheme: "dark" as const };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
