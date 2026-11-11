"use client";

import { useEffect, useRef, type RefObject } from "react";

/** What the dots are doing. Each value is 0..1 and is eased toward every frame. */
export interface HalftoneState {
  /** Dots fill in from nothing. */
  grow: number;
  /** Dots swell and brighten. */
  bright: number;
  /** A ring of larger dots travels out from the middle. */
  pulse: number;
  /** Everything below `split` shrinks away. */
  sink: number;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** A picture redrawn as a grid of coloured dots, each sized by how bright the picture is there. */
export function Halftone({
  src,
  state,
  gap = 9,
  split = 0.7,
  className,
}: {
  src: string;
  state: RefObject<HalftoneState>;
  gap?: number;
  split?: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cur: HalftoneState = { grow: 0, bright: 0, pulse: 0, sink: 0 };
    let cols = 0;
    let rows = 0;
    /** Dots grouped by colour, so each colour is one fill: [x, y, size, seed, ...]. */
    let groups = new Map<string, number[]>();
    let raf = 0;
    let visible = false;
    const img = new Image();
    img.src = src;

    const sample = () => {
      if (!img.complete || !img.naturalWidth) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.max(1, Math.floor(w / gap));
      rows = Math.max(1, Math.floor(h / gap));
      const off = document.createElement("canvas");
      off.width = cols;
      off.height = rows;
      const o = off.getContext("2d", { willReadFrequently: true })!;
      // cover
      const s = Math.max(cols / img.naturalWidth, rows / img.naturalHeight);
      const sw = img.naturalWidth * s;
      const sh = img.naturalHeight * s;
      o.drawImage(img, (cols - sw) / 2, (rows - sh) / 2, sw, sh);
      const px = o.getImageData(0, 0, cols, rows).data;
      groups = new Map();
      const ox = (w - cols * gap) / 2 + gap / 2;
      const oy = (h - rows * gap) / 2 + gap / 2;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = (r * cols + c) * 4;
          const lum = (px[p] * 0.3 + px[p + 1] * 0.59 + px[p + 2] * 0.11) / 255;
          if (lum < 0.07) continue;
          const q = (v: number) => Math.min(255, (v >> 4) * 17);
          const key = `rgb(${q(px[p])},${q(px[p + 1])},${q(px[p + 2])})`;
          let list = groups.get(key);
          if (!list) groups.set(key, (list = []));
          list.push(ox + c * gap, oy + r * gap, 0.3 + 0.7 * lum, hash(r * cols + c));
        }
      }
    };

    const draw = (time: number) => {
      raf = requestAnimationFrame(draw);
      if (!visible || !cols) return;
      const target = state.current;
      const k = reduce ? 1 : 0.07;
      cur.grow += (target.grow - cur.grow) * k;
      cur.bright += (target.bright - cur.bright) * k;
      cur.pulse += (target.pulse - cur.pulse) * k;
      cur.sink += (target.sink - cur.sink) * k;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const t = reduce ? 0.4 : time / 1000;
      const ring = ((t * 0.32) % 1) * Math.hypot(w, h) * 0.7;
      const cx = w / 2;
      const cy = h * split * 0.6;
      const waterline = h * split;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = 0.62 + 0.38 * cur.bright;
      for (const [colour, list] of groups) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        for (let i = 0; i < list.length; i += 4) {
          const x = list[i];
          const y = list[i + 1];
          const born = Math.min(1, Math.max(0, cur.grow * 1.5 - list[i + 3] * 0.5));
          if (born <= 0) continue;
          let size = list[i + 2] * born * (0.78 + 0.22 * cur.bright);
          if (cur.pulse > 0.01) {
            const d = (Math.hypot(x - cx, y - cy) - ring) / 46;
            size *= 1 + Math.exp(-d * d) * 0.55 * cur.pulse;
          }
          if (y > waterline) size *= 1 - cur.sink * 0.82;
          const radius = Math.min(gap * 0.56, size * gap * 0.5);
          ctx.moveTo(x + radius, y);
          ctx.arc(x, y, radius, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    observer.observe(canvas);
    const resizer = new ResizeObserver(sample);
    resizer.observe(canvas);
    img.addEventListener("load", sample);
    sample();
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizer.disconnect();
      img.removeEventListener("load", sample);
    };
  }, [src, gap, split, state]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
