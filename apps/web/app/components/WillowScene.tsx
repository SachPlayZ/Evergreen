"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

/**
 * The willow woodcut, alive. The picture is cut into vertical strips that hang
 * and sway from the top like the strands they show, and the water below is cut
 * into rows that slide against each other. A still copy sits underneath, so the
 * trunks and the people on the bank never move.
 */
const STRIPS = 16;
const ROWS = 14;
/** Where the bank sits in the frame, top to bottom. */
const BANK = 0.7;

export function WillowScene() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 1], reduce ? [1, 1] : [1, 1.12]);
  const y = useTransform(scrollYProgress, [0, 1], reduce ? ["0%", "0%"] : ["0%", "6%"]);

  return (
    <div ref={ref} className="scene" role="img" aria-label="Weeping willows over a still green lake, as a woodcut">
      <motion.div className="scene-inner" style={{ scale, y }}>
        <div className="scene-art" />
        <div className="scene-canopy" aria-hidden="true">
          {Array.from({ length: STRIPS }, (_, i) => (
            <div
              key={i}
              className="scene-strip"
              style={{
                left: `${(i / STRIPS) * 100}%`,
                width: `calc(${100 / STRIPS}% + 2px)`,
                animationDelay: `${-((i * 0.83) % 7).toFixed(2)}s`,
                animationDuration: `${6 + (i % 4) * 0.9}s`,
              }}
            >
              <div className="scene-art" style={{ left: `calc((100% - 2px) * ${-i})`, width: `calc((100% - 2px) * ${STRIPS})` }} />
            </div>
          ))}
        </div>
        <div className="scene-water" aria-hidden="true" style={{ top: `${BANK * 100}%` }}>
          {Array.from({ length: ROWS }, (_, i) => (
            <div
              key={i}
              className="scene-row"
              style={{
                top: `${(i / ROWS) * 100}%`,
                height: `calc(${100 / ROWS}% + 1px)`,
                animationDelay: `${-(i * 0.31).toFixed(2)}s`,
                // ripples widen toward the viewer
                ["--drift" as string]: `${2 + i * 0.5}px`,
              }}
            >
              <div
                className="scene-art"
                style={{
                  top: `calc((100% - 1px) * ${-(BANK / (1 - BANK)) * ROWS - i})`,
                  height: `calc((100% - 1px) * ${ROWS / (1 - BANK)})`,
                }}
              />
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
