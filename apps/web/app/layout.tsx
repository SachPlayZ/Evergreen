import type { Metadata } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const display = Anton({ variable: "--font-display", weight: "400", subsets: ["latin"] });
const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Evergreen: NEAR names that keep themselves alive",
  description:
    "NEAR names now expire. An Evergreen Name is owned by a Steward contract that pays its yearly Rent from its own staking rewards.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
