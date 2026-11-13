// Renders the Evergreen logo, favicon set and share banner from the page's own art (public/art).
// Run from apps/web: node scripts/brand.mjs   (fetches Newsreader from Google Fonts)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import React from "react";
import { ImageResponse } from "next/og.js";

const sharp = createRequire(createRequire(import.meta.url).resolve("next/package.json"))("sharp");
const h = React.createElement;

const INK = "#070a06";
const TEXT = "#ecebdc";
const MUTED = "#a4aa93";
const LEAF = "#b6e04a";

const font = async (query) => {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${query}`)).text();
  return (await fetch(/url\((.+?\.ttf)\)/.exec(css)[1])).arrayBuffer();
};
const fonts = [
  { name: "Newsreader", data: await font("Newsreader:opsz,wght@72,400"), style: "normal", weight: 400 },
  { name: "Newsreader", data: await font("Newsreader:ital,opsz,wght@1,72,400"), style: "italic", weight: 400 },
];

const png = async (file, width) =>
  `data:image/png;base64,${(await sharp(file).resize({ width }).png().toBuffer()).toString("base64")}`;
const moth = await png("public/art/moth-5.webp", 236 * 4);
const mothSmall = await png("public/art/moth-2.webp", 153 * 2);
const mothTiny = await png("public/art/moth-1.webp", 92 * 2);
const willow = await png("public/art/willow.webp", 736);

const render = async (el, width, height) =>
  Buffer.from(await new ImageResponse(el, { width, height, fonts }).arrayBuffer());

// The mark: one luna moth on an ink tile with a faint leaf glow.
const mark = (size, { round = true, glow = true } = {}) =>
  h(
    "div",
    {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: glow ? `radial-gradient(circle at 50% 55%, #1d3a12 0%, ${INK} 68%)` : INK,
        borderRadius: round ? size * 0.22 : 0,
      },
    },
    h("img", { src: moth, width: size * 0.84, height: size * 0.84 * (178 / 236), style: { marginTop: size * 0.04 } }),
  );

const wordmark = (px) =>
  h(
    "div",
    { style: { display: "flex", fontFamily: "Newsreader", fontSize: px, color: TEXT, letterSpacing: -px * 0.02 } },
    "Ever",
    h("span", { style: { fontStyle: "italic", color: LEAF } }, "green"),
  );

const out = "brand";
mkdirSync(out, { recursive: true });

// Logo: mark alone, and mark + wordmark.
writeFileSync(`${out}/logo-mark.png`, await render(mark(1024), 1024, 1024));
writeFileSync(
  `${out}/logo.png`,
  await render(
    h(
      "div",
      { style: { width: 1600, height: 480, display: "flex", alignItems: "center", gap: 56, padding: "0 80px", background: INK } },
      mark(320),
      wordmark(220),
    ),
    1600,
    480,
  ),
);

// Favicons (app/ file conventions): icon.png, apple-icon.png, favicon.ico (16 + 32 + 48).
writeFileSync("app/icon.png", await render(mark(512), 512, 512));
writeFileSync("app/apple-icon.png", await render(mark(180, { round: false }), 180, 180));
const small = await render(mark(256, { glow: false }), 256, 256);
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map((s) => sharp(small).resize(s, s).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  header[e] = s;
  header[e + 1] = s;
  header.writeUInt16LE(1, e + 4);
  header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(images[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
writeFileSync("app/favicon.ico", Buffer.concat([header, ...images]));

// Share banner: words on ink, the willow on the right, moths leaving the tree.
const banner = (w, ht) =>
  h(
    "div",
    { style: { width: w, height: ht, display: "flex", position: "relative", background: INK, overflow: "hidden" } },
    h("img", {
      src: willow,
      width: Math.max(ht * (736 / 1308) * 1.9, w * 0.52),
      height: Math.max(ht * 1.9, w * 0.52 * (1308 / 736)),
      style: { position: "absolute", right: 0, top: ht * 0.84 - Math.max(ht * 1.9, w * 0.52 * (1308 / 736)) * 0.63 },
    }),
    h("div", {
      style: {
        position: "absolute",
        left: 0,
        top: 0,
        width: w,
        height: ht,
        background: `linear-gradient(90deg, ${INK} 0%, ${INK} 50%, rgba(7,10,6,0.6) 64%, rgba(7,10,6,0) 84%)`,
      },
    }),
    h("img", { src: mothSmall, width: 120, height: 124, style: { position: "absolute", right: w * 0.2, top: ht * 0.12, transform: "rotate(-12deg)" } }),
    h("img", { src: mothTiny, width: 64, height: 61, style: { position: "absolute", right: w * 0.07, top: ht * 0.06, transform: "rotate(14deg)" } }),
    h(
      "div",
      { style: { position: "relative", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, width: w * 0.62 } },
      h("div", { style: { display: "flex", alignItems: "center", gap: 20 } }, mark(76), wordmark(56)),
      h(
        "div",
        { style: { display: "flex", flexDirection: "column", gap: 24 } },
        h(
          "div",
          { style: { display: "flex", flexDirection: "column", fontFamily: "Newsreader", fontSize: 68, lineHeight: 1.04, color: TEXT, letterSpacing: -1.5 } },
          h("span", null, "Names expire."),
          h("span", { style: { display: "flex" } }, "This one ", h("span", { style: { fontStyle: "italic", color: LEAF } }, "renews itself.")),
        ),
        h(
          "div",
          { style: { fontSize: 28, lineHeight: 1.35, color: MUTED, maxWidth: 560 } },
          "A NEAR Name whose Steward contract pays the Rent from staking rewards.",
        ),
      ),
      h("div", { style: { fontSize: 24, color: MUTED } }, "evergreen-names.vercel.app"),
    ),
  );

const og = await render(banner(1200, 630), 1200, 630);
writeFileSync(`${out}/banner.png`, og);
writeFileSync("app/opengraph-image.png", og);
writeFileSync("app/twitter-image.png", og);
writeFileSync(`${out}/banner-x-header.png`, await render(banner(1500, 500), 1500, 500));
console.log("wrote brand/, app/icon.png, app/apple-icon.png, app/favicon.ico, app/opengraph-image.png, app/twitter-image.png");
