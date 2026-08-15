"use client";

import { useCallback, useEffect, useState } from "react";

export interface Testimonial {
  quote: string;
  name: string;
  role?: string;
}

// Design-partner placeholder testimonials — swap for real cohort quotes.
// Calm, executive motion: crossfade + slide, auto-advance with pause on hover.
export function TestimonialCarousel({ items }: { items: Testimonial[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = useCallback(
    (dir: 1 | -1) => setIndex((i) => (i + dir + items.length) % items.length),
    [items.length],
  );

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % items.length), 6000);
    return () => clearInterval(t);
  }, [paused, items.length]);

  const current = items[index];
  if (!current) return null;

  return (
    <div
      className="relative mx-auto max-w-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative min-h-[16rem] overflow-hidden rounded-2xl border border-hairline bg-white p-8 shadow-sm sm:p-12">
        <span aria-hidden className="absolute left-6 top-5 font-serif text-6xl leading-none text-navy-800/15">
          &ldquo;
        </span>
        <div key={index} className="animate-carousel-in relative">
          <blockquote className="text-lg leading-relaxed text-ink sm:text-xl">
            {current.quote}
          </blockquote>
          <figcaption className="mt-6 flex items-center gap-3">
            <span
              aria-hidden
              className="grid h-10 w-10 place-items-center rounded-full bg-navy-800 font-mono text-xs font-semibold text-white"
            >
              {current.name.replace(/^\[?/, "").slice(0, 2).toUpperCase()}
            </span>
            <div>
              <p className="text-sm font-semibold text-navy-900">{current.name}</p>
              {current.role ? <p className="text-xs text-muted">{current.role}</p> : null}
            </div>
          </figcaption>
        </div>
      </div>

      {/* controls */}
      <div className="mt-5 flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous testimonial"
          className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-white text-navy-800 transition-colors hover:border-navy-800"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="flex items-center gap-2" role="tablist" aria-label="Testimonials">
          {items.map((t, i) => (
            <button
              key={t.name}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Testimonial ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-navy-800" : "w-1.5 bg-hairline hover:bg-muted"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next testimonial"
          className="grid h-9 w-9 place-items-center rounded-full border border-hairline bg-white text-navy-800 transition-colors hover:border-navy-800"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
