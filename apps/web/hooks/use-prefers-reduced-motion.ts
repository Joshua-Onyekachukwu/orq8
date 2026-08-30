"use client";

import { useEffect, useState } from "react";

// Shared reduced-motion check for autoplay/motion decisions.
// Mirrors the media query in globals.css so JS motion (swiper autoplay)
// honors the same preference the CSS animations do.
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
