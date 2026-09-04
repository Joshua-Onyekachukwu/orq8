"use client";

import React from "react";
import Link from "next/link";

const HeroBanner: React.FC = () => {
  return (
    <section className="relative z-[1] bg-white overflow-hidden">
      {/* Subtle top gradient accent — not decoration, brand identity */}
      <div
        className="absolute top-0 left-0 right-0 h-[1px]"
        style={{
          background: "linear-gradient(90deg, transparent 0%, #10b981 50%, transparent 100%)",
        }}
      />

      {/* Very subtle background texture — barely visible, adds depth */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, #0f172a 1px, transparent 0)",
          backgroundSize: "40px 40px",
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pt-32 pb-24 lg:pt-44 lg:pb-36">
        {/* Centered layout — Trezo-inspired clean centered hero */}
        <div className="text-center mx-auto lg:max-w-[850px]">
          {/* Eyebrow — mono, tracked, purposeful */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-hairline bg-canvas mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-muted">
              AI Organization Operating System
            </span>
          </div>

          {/* Headline — Strong, specific, confident */}
          <h1 className="font-display text-5xl md:text-6xl lg:text-7xl xl:text-[82px] font-medium text-ink leading-[1.08] tracking-tight mb-6">
            Run a company{" "}
            <span className="text-emerald italic">of one</span>
          </h1>

          {/* Supporting copy — Clear, specific, no buzzwords */}
          <p className="text-lg lg:text-xl text-ink-muted leading-relaxed mb-12 max-w-[560px] mx-auto">
            You set the direction. ORQ8 hires the AI team, does the work,
            and reports back under your approvals and your budget.
          </p>

          {/* Primary CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/register"
              className="group inline-flex items-center justify-center gap-3 px-8 py-4 bg-emerald text-navy-950 font-semibold text-sm tracking-wide rounded-full hover:bg-emerald-dark transition-all duration-200 shadow-sm hover:shadow-md"
            >
              Start Free Trial
              <svg
                className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 text-ink font-medium text-sm tracking-wide rounded-full border border-hairline hover:border-ink-faint hover:bg-canvas transition-all duration-200"
            >
              Learn More
            </Link>
          </div>

          {/* Trust signal — Real, not fake */}
          <p className="mt-8 text-sm text-ink-faint">
            7-day free trial · No credit card required · Cancel anytime
          </p>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
