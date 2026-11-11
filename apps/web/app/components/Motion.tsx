"use client";

import Lenis from "lenis";
import { animate, motion, useInView, useMotionValue, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";

/** Smooth scrolling for the whole page, plus the progress bar at the top. */
export function SmoothScroll() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 140, damping: 26 });
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1 });
    let raf = requestAnimationFrame(function loop(time) {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);
  return <motion.div className="progress" style={{ scaleX }} aria-hidden="true" />;
}

/** Slides and fades its children in when they scroll into view. */
export function Reveal({
  children,
  delay = 0,
  y = 36,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: 0.8, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Headline that rises word by word. */
export function Words({ text, className, delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className} aria-label={text}>
      {text.split(" ").map((word, i) => (
        <span key={i} className="word" aria-hidden="true">
          <motion.span
            initial={{ y: "110%", rotate: 4 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ duration: 0.9, delay: delay + i * 0.07, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/** Section heading whose hatched rule draws itself across. */
export function Heading({ title, sub }: { title: string; sub: string }) {
  return (
    <h2>
      <motion.i
        className="rule"
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-10% 0px" }}
        transition={{ duration: 1.1, ease: [0.3, 0.7, 0.2, 1] }}
      />
      <Reveal y={24}>
        {title}
        <span>{sub}</span>
      </Reveal>
    </h2>
  );
}

/** Counts up to `value` when it scrolls into view. */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString("en-US") }: { value: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-10% 0px" });
  const n = useMotionValue(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(n, value, { duration: 1.6, ease: [0.2, 0.7, 0.2, 1] });
    const off = n.on("change", (v) => {
      if (ref.current) ref.current.textContent = format(v);
    });
    return () => {
      controls.stop();
      off();
    };
  }, [inView, value, n, format]);
  return <span ref={ref}>{format(0)}</span>;
}

/** A card that tilts in 3D toward the pointer, with a moving glare. */
export function Tilt({ children, className }: { children: ReactNode; className?: string }) {
  const rx = useSpring(0, { stiffness: 160, damping: 16 });
  const ry = useSpring(0, { stiffness: 160, damping: 16 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glare = useTransform([gx, gy], ([x, y]) => `radial-gradient(520px circle at ${x}% ${y}%, rgba(201,247,58,0.20), transparent 55%)`);
  return (
    <div className="tilt-stage">
      <motion.div
        className={`tilt ${className ?? ""}`}
        style={{ rotateX: rx, rotateY: ry }}
        onPointerMove={(e) => {
          if (e.pointerType === "touch") return;
          const r = e.currentTarget.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          ry.set((px - 0.5) * 16);
          rx.set((0.5 - py) * 12);
          gx.set(px * 100);
          gy.set(py * 100);
        }}
        onPointerLeave={() => {
          rx.set(0);
          ry.set(0);
        }}
      >
        {children}
        <motion.div className="glare" style={{ background: glare }} aria-hidden="true" />
      </motion.div>
    </div>
  );
}

/** Drifts its children against the scroll for depth. */
export function Parallax({ children, amount = 80, className }: { children: ReactNode; amount?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [amount, -amount]);
  return (
    <motion.div ref={ref} className={className} style={{ y }}>
      {children}
    </motion.div>
  );
}

/** An endless ticker. */
export function Marquee({ items }: { items: string[] }) {
  const row = [...items, ...items];
  return (
    <div className="marquee" aria-hidden="true">
      <div className="marquee-track">
        {row.map((item, i) => (
          <span key={i}>{item}</span>
        ))}
      </div>
    </div>
  );
}
