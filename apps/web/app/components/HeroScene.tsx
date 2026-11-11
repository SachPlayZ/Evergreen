"use client";

import { useEffect, useRef } from "react";

/**
 * The hero: weeping willows over still water, drawn entirely in dots.
 * Strands hang from the top and sway; trunks are the gaps the strands leave;
 * the lower third mirrors everything as a rippling reflection.
 * Scrolling down shortens every strand, the way a Lease runs out.
 */
const GAP = 9;
const LEAF = ["#c9f73a", "#a5e63a", "#6fce3c", "#2f8f3a", "#1c6a2e"];
const WATER = ["#0f7a48", "#12975a", "#0b5c38"];

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function HeroScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let pointerX = -9999;
    let pointerY = -9999;
    let wind = 0;
    let visible = true;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /** How far down the strand in column `col` hangs, 0..1 of the bank height. */
    const canopy = (col: number, cols: number): number => {
      const x = col / cols;
      // three overlapping crowns, like trees along a bank
      const crown = (c: number, r: number) => Math.max(0, 1 - ((x - c) / r) ** 2);
      const shape = Math.max(crown(0.2, 0.27) * 0.9, crown(0.62, 0.25) * 1, crown(1.0, 0.2) * 0.78);
      return Math.pow(shape, 0.72) * (0.68 + 0.32 * hash(col)) + 0.09 * hash(col + 99);
    };
    /** Trunks are negative space. */
    const inTrunk = (x: number, y: number, bank: number): boolean => {
      for (const [cx, half] of [
        [0.2, 0.012],
        [0.62, 0.016],
      ] as const) {
        const lean = Math.sin(y / bank * 2.2 + cx * 9) * 0.012;
        const flare = y > bank * 0.82 ? ((y - bank * 0.82) / (bank * 0.18)) * 0.02 : 0;
        if (y > bank * 0.16 && Math.abs(x / w - cx - lean) < half + flare) return true;
        // one forking branch
        const by = bank * (0.42 - (x / w - cx) * 1.1);
        if (x / w > cx && x / w < cx + 0.09 && Math.abs(y - by) < 5) return true;
      }
      return false;
    };

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;
      const t = reduce ? 0 : time / 1000;
      const scroll = Math.min(1, window.scrollY / Math.max(1, h * 0.9));
      const life = 1 - scroll * 0.85;
      wind += ((pointerX > 0 ? (pointerX / w - 0.5) * 2 : 0) - wind) * 0.04;

      ctx.clearRect(0, 0, w, h);
      const bank = h * 0.64;
      const cols = Math.ceil(w / GAP);
      const buckets: number[][] = LEAF.map(() => []);
      const mirror: number[][] = WATER.map(() => []);

      for (let col = 0; col <= cols; col++) {
        const full = canopy(col, cols) * bank;
        const len = full * life;
        const baseX = col * GAP;
        const phase = col * 0.21 + hash(col) * 6;
        for (let y = GAP * 0.5; y < len; y += GAP) {
          const depth = y / Math.max(1, full);
          let x = baseX + (Math.sin(t * 0.9 + phase + depth * 2.4) * 7 + wind * 26) * depth * depth;
          const dx = x - pointerX;
          const dy = y - pointerY;
          const d2 = dx * dx + dy * dy;
          if (d2 < 14000) x += (dx / Math.sqrt(d2 + 1)) * (1 - d2 / 14000) * 22;
          if (inTrunk(x, y, bank)) continue;
          const shade = Math.min(LEAF.length - 1, Math.floor(hash(col * 31 + Math.round(y / GAP) * 17) * 3 + depth * 2.2));
          buckets[shade].push(x, y);
          // reflection
          const ry = bank + (bank - y) * 0.52 + 6;
          if (ry < h) {
            const rx = x + Math.sin(t * 1.6 + ry * 0.09) * (3 + (ry - bank) * 0.03);
            mirror[(col + Math.round(y / GAP)) % WATER.length].push(rx, ry);
          }
        }
      }

      // water: short horizontal cuts, as in a woodcut
      ctx.fillStyle = "rgba(15, 122, 72, 0.5)";
      for (let y = bank + 10; y < h; y += 7) {
        const shift = Math.sin(t * 0.7 + y * 0.05) * 14;
        for (let x = -20 + ((y * 37) % 46) + shift; x < w; x += 46) {
          ctx.fillRect(x, y, 16 + hash(y + x) * 12, 1.4);
        }
      }
      mirror.forEach((points, i) => {
        ctx.fillStyle = WATER[i];
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        for (let p = 0; p < points.length; p += 2) {
          ctx.rect(points[p] - 3, points[p + 1] - 1.1, 6, 2.2);
        }
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      // the bank
      ctx.fillStyle = "#050704";
      ctx.fillRect(0, bank - 2, w, 9);
      buckets.forEach((points, i) => {
        ctx.fillStyle = LEAF[i];
        ctx.beginPath();
        for (let p = 0; p < points.length; p += 2) {
          ctx.moveTo(points[p] + 3.1, points[p + 1]);
          ctx.arc(points[p], points[p + 1], 3.1, 0, Math.PI * 2);
        }
        ctx.fill();
      });
      if (reduce) cancelAnimationFrame(raf);
    };

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointerX = e.clientX - rect.left;
      pointerY = e.clientY - rect.top;
    };
    const onLeave = () => {
      pointerX = pointerY = -9999;
    };
    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    observer.observe(canvas);
    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} className="hero-scene" aria-hidden="true" />;
}
