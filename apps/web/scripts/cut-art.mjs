// Cuts the reference art in public/*.jpg into the web assets in public/art/.
// Run from apps/web: node scripts/cut-art.mjs
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const require = createRequire(require_next());
function require_next() {
  return createRequire(import.meta.url).resolve("next/package.json");
}
const sharp = require("sharp");

const OUT = "public/art";
mkdirSync(OUT, { recursive: true });

await sharp("public/1692587b740631d2fc710a3c1e1f1b94.jpg").webp({ quality: 86 }).toFile(`${OUT}/willow.webp`);
await sharp("public/d5f1464a7732817ad0c343e48906b37c.jpg").webp({ quality: 84 }).toFile(`${OUT}/cat.webp`);

// Moths: crop, key the night sky out, keep only the largest blob (drops stars and neighbours).
const MOTHS = [
  [130, 95, 120, 120],
  [375, 190, 170, 175],
  [185, 335, 165, 150],
  [415, 450, 210, 200],
  [180, 605, 255, 205],
];
const src = sharp("public/c55024f2ea0b3c155f93ffc728e1f268.jpg");
for (const [i, [left, top, width, height]] of MOTHS.entries()) {
  const { data } = await src.clone().extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  const n = width * height;
  const solid = new Uint8Array(n);
  for (let p = 0; p < n; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    // sky is blue-dominant and dark; moth is green/tan/maroon
    solid[p] = Math.max(r, g) > 105 && Math.max(r, g) > b * 1.08 ? 1 : 0;
  }
  // largest connected component
  const label = new Int32Array(n);
  let best = 0, bestSize = 0, next = 0;
  for (let p = 0; p < n; p++) {
    if (!solid[p] || label[p]) continue;
    const id = ++next;
    const stack = [p];
    label[p] = id;
    let size = 0;
    while (stack.length) {
      const q = stack.pop();
      size++;
      const x = q % width, y = (q / width) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const m = ny * width + nx;
        if (solid[m] && !label[m]) {
          label[m] = id;
          stack.push(m);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = id;
    }
  }
  // grow by 2px to take in the dark outline, then feather
  let mask = Uint8Array.from(label, (l) => (l === best ? 255 : 0));
  for (let pass = 0; pass < 2; pass++) {
    const grown = new Uint8Array(mask);
    for (let y = 1; y < height - 1; y++)
      for (let x = 1; x < width - 1; x++) {
        const p = y * width + x;
        if (mask[p - 1] || mask[p + 1] || mask[p - width] || mask[p + width]) grown[p] = 255;
      }
    mask = grown;
  }
  const soft = await sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } }).blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const alpha = (p) => soft.data[p * soft.info.channels];
  const rgba = Buffer.alloc(n * 4);
  for (let p = 0; p < n; p++) {
    rgba[p * 4] = data[p * 3];
    rgba[p * 4 + 1] = data[p * 3 + 1];
    rgba[p * 4 + 2] = data[p * 3 + 2];
    rgba[p * 4 + 3] = alpha(p);
  }
  await sharp(rgba, { raw: { width, height, channels: 4 } }).trim().webp({ quality: 90 }).toFile(`${OUT}/moth-${i + 1}.webp`);
}
// contact sheet for eyeballing the cut-outs
const sheet = await Promise.all(
  MOTHS.map(async (_, i) => ({ input: await sharp(`${OUT}/moth-${i + 1}.webp`).resize(200, 200, { fit: "contain", background: "#00000000" }).png().toBuffer(), left: i * 200, top: 0 })),
);
await sharp({ create: { width: 1000, height: 200, channels: 3, background: "#7a2f2f" } }).composite(sheet).png().toFile(process.argv[2] ?? "/dev/null");
console.log("art cut to", OUT);
