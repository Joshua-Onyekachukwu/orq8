"use client";

import React, { useEffect, useRef } from "react";

/**
 * The hero's light field: a very low-opacity light that trails the pointer
 * across the hero surface, with a smaller warm accent lagging behind it so the
 * movement reads as light crossing a physical surface rather than a glow
 * attached to the cursor.
 *
 * Constraints this is written to (see the marketing migration brief §18-§25):
 *
 * - Two token-derived layers, both under 15% alpha: the pale tone carries the
 *   illumination and the warm accent is a whisper, offset from the light and
 *   lagging further behind it. No hue outside the ORQ8 palette, ever.
 * - It sits behind the content (`z-0`, content is `z-10`), is `aria-hidden` and
 *   `pointer-events-none`, so it can never touch contrast, hit targets or
 *   selection.
 * - One `pointermove` listener writes to a ref. A single requestAnimationFrame
 *   loop interpolates toward it and writes CSS custom properties, so React
 *   never re-renders and only paint-level properties change. The loop stops
 *   when the light has caught up and the fade has finished.
 * - Under `prefers-reduced-motion: reduce` the light is kept but the movement is
 *   not: the surface is lit at rest, parked off-centre, with no listener and no
 *   frame loop. The preference is about animation, and a hero that is lit is not
 *   an animation. (This also matters in practice: Windows can be configured with
 *   client-area animations off, which Chromium reports as reduced motion, so the
 *   earlier "off entirely" behaviour left the hero completely unlit for those
 *   users.) On touch or coarse pointers the light is driven by nothing, so it is
 *   not shown at all — the hero is complete without it.
 */

/** How fast each layer catches the pointer. Lower is looser, more physical. */
const LIGHT_EASE = 0.09;
const WARM_EASE = 0.045;
/** The warm accent trails by this much, so the two layers never look concentric. */
const WARM_OFFSET = { x: -26, y: 18 };
/** The light is parked at rest until the pointer is inside the hero. */
const FADE_EASE = 0.08;
/** Below this movement the loop parks itself and waits for the next pointer. */
const SETTLED = 0.35;

/** Where the light and its warm accent sit when nothing is driving them. Both
 * are off-centre and offset from each other, so the reduced-motion surface is a
 * lit surface rather than a spotlight, at any viewport size. */
const REST_LIGHT = { x: "38%", y: "42%" };
const REST_WARM = { x: "62%", y: "58%" };

const FINE_POINTER = "(hover: hover) and (pointer: fine)";
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function HeroLightField({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const finePointer = window.matchMedia(FINE_POINTER);
    const reducedMotion = window.matchMedia(REDUCED_MOTION);

    let frame: number | null = null;
    let listening = false;

    /** Where the pointer is, in hero-relative pixels. */
    const target = { x: 0, y: 0, inside: false };
    /** Where the light currently is, and how visible it is. */
    const light = { x: 0, y: 0, opacity: 0 };
    const warm = { x: 0, y: 0 };

    const write = () => {
      el.style.setProperty("--hero-light-x", `${light.x.toFixed(2)}px`);
      el.style.setProperty("--hero-light-y", `${light.y.toFixed(2)}px`);
      el.style.setProperty("--hero-warm-x", `${warm.x.toFixed(2)}px`);
      el.style.setProperty("--hero-warm-y", `${warm.y.toFixed(2)}px`);
      el.style.setProperty("--hero-light-opacity", light.opacity.toFixed(3));
    };

    const step = () => {
      const goal = target.inside ? 1 : 0;
      light.opacity += (goal - light.opacity) * FADE_EASE;
      light.x += (target.x - light.x) * LIGHT_EASE;
      light.y += (target.y - light.y) * LIGHT_EASE;
      warm.x += (target.x + WARM_OFFSET.x - warm.x) * WARM_EASE;
      warm.y += (target.y + WARM_OFFSET.y - warm.y) * WARM_EASE;
      write();

      const settled =
        Math.abs(target.x - light.x) < SETTLED &&
        Math.abs(target.y - light.y) < SETTLED &&
        Math.abs(goal - light.opacity) < 0.01;

      if (settled) {
        // Park on the exact target so nothing drifts over time.
        light.x = target.x;
        light.y = target.y;
        light.opacity = goal;
        warm.x = target.x + WARM_OFFSET.x;
        warm.y = target.y + WARM_OFFSET.y;
        write();
        frame = null;
        return;
      }
      frame = window.requestAnimationFrame(step);
    };

    const run = () => {
      if (frame === null) frame = window.requestAnimationFrame(step);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      target.x = event.clientX - rect.left;
      target.y = event.clientY - rect.top;
      if (!target.inside) {
        target.inside = true;
        // Start the light where the pointer entered, so it never sweeps in
        // from a corner on the first move.
        if (light.opacity === 0) {
          light.x = target.x;
          light.y = target.y;
          warm.x = target.x + WARM_OFFSET.x;
          warm.y = target.y + WARM_OFFSET.y;
        }
      }
      run();
    };

    const onPointerLeave = () => {
      target.inside = false;
      run();
    };

    const attach = () => {
      if (listening) return;
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
      window.addEventListener("blur", onPointerLeave);
      listening = true;
    };

    const detach = () => {
      if (!listening) return;
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      listening = false;
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
        frame = null;
      }
      target.inside = false;
      light.opacity = 0;
      write();
    };

    /** Lit at rest: no listeners, no frames, just a surface that catches light. */
    const park = () => {
      el.style.setProperty("--hero-light-x", REST_LIGHT.x);
      el.style.setProperty("--hero-light-y", REST_LIGHT.y);
      el.style.setProperty("--hero-warm-x", REST_WARM.x);
      el.style.setProperty("--hero-warm-y", REST_WARM.y);
      el.style.setProperty("--hero-light-opacity", "1");
    };

    /** Dark: the field is not part of this hero at all. */
    const dark = () => el.style.setProperty("--hero-light-opacity", "0");

    const sync = () => {
      // Driven only where it can be driven: a fine pointer and no reduced-motion
      // request. Reduced motion keeps the lit surface and drops the movement;
      // a coarse pointer has nothing to drive it, so the hero goes without.
      if (finePointer.matches && !reducedMotion.matches) {
        attach();
      } else {
        detach();
        if (reducedMotion.matches) park();
        else dark();
      }
    };

    sync();
    finePointer.addEventListener("change", sync);
    reducedMotion.addEventListener("change", sync);

    return () => {
      detach();
      finePointer.removeEventListener("change", sync);
      reducedMotion.removeEventListener("change", sync);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
      style={{
        // Token-derived, so the light can never drift off the ORQ8 palette.
        //
        // `--orq-ink-accent` rather than `--orq-brand-soft`: inside an ink band
        // brand-soft inverts to its dark wash, so a light built on it is a dark
        // smudge on black. ink-accent is the pale tone in both scopes, which is
        // the one that belongs on a black surface. The warm accent is a whisper
        // in its own offset layer, which is what makes the movement read as
        // light on a surface rather than a blob following the cursor.
        backgroundImage: [
          "radial-gradient(680px circle at var(--hero-light-x, 50%) var(--hero-light-y, 50%), color-mix(in srgb, var(--orq-ink-accent) 10%, transparent), transparent 62%)",
          "radial-gradient(280px circle at var(--hero-warm-x, 50%) var(--hero-warm-y, 50%), color-mix(in srgb, var(--orq-warm) 6%, transparent), transparent 66%)",
        ].join(","),
        opacity: "var(--hero-light-opacity, 0)",
      }}
    />
  );
}

export default HeroLightField;
