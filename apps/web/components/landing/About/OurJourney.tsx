"use client";

import React from "react";
import { Reveal } from "../Common/Reveal";

const OurJourney: React.FC = () => {
  return (
    <section className="bg-orq8-dark py-[80px] md:py-[120px] lg:py-[160px]">
      <div className="mx-auto max-w-[1200px] px-[20px] md:px-[24px]">
        <Reveal>
          <div className="mb-[48px] md:mb-[64px]">
            <span className="mb-[12px] block text-overline font-bold uppercase tracking-[0.2em] text-orq8-lime">
              Our Story
            </span>
            <h2 className="text-[32px] md:text-[40px] font-normal leading-tight tracking-tight text-white">
              Why we built ORQ8
            </h2>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-[24px] md:grid-cols-2">
          {/* Mission */}
          <Reveal>
            <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-[32px] md:p-[40px] lg:p-[48px]">
              <span className="mb-[16px] block text-overline font-bold uppercase tracking-[0.2em] text-orq8-lime">
                Our Mission
              </span>
              <h3 className="mb-[16px] text-[24px] font-normal leading-tight tracking-tight text-white">
                Make AI organizations accessible to every founder
              </h3>
              <p className="text-md leading-relaxed text-white/50 md:text-base">
                Every solo founder deserves the operational power of a full
                company. ORQ8 gives you specialized AI employees, an Executive
                Agent that plans and coordinates, approval gates that keep you in
                control, and a memory system that makes your organization smarter
                over time.
              </p>
            </div>
          </Reveal>

          {/* Vision */}
          <Reveal>
            <div className="rounded-[16px] border border-orq8-lime/20 bg-orq8-lime/5 p-[32px] md:p-[40px] lg:p-[48px]">
              <span className="mb-[16px] block text-overline font-bold uppercase tracking-[0.2em] text-orq8-lime">
                Our Vision
              </span>
              <h3 className="mb-[16px] text-[24px] font-normal leading-tight tracking-tight text-white">
                A world where one person can run a real company
              </h3>
              <p className="text-md leading-relaxed text-white/50 md:text-base">
                We started ORQ8 because the tools solo founders use today
                require them to do everything themselves: accounting, marketing,
                operations, support. None of it connects. None of it runs without
                them. We built an operating system where AI employees handle the
                work, the Executive Agent coordinates the effort, and the founder
                stays in command of every consequential decision.
              </p>
            </div>
          </Reveal>
        </div>

        {/* CTA */}
        <Reveal>
          <div className="mt-[64px] text-center">
            <p className="mb-[24px] text-sm text-white/40">
              Join the first cohort and build your AI organization.
            </p>
            <a
              href="/#waitlist"
              className="inline-flex items-center gap-[10px] rounded-full bg-orq8-lime px-[28px] py-[12px] text-sm font-semibold text-orq8-dark transition-colors hover:bg-orq8-lime"
            >
              JOIN THE WAITLIST
              <svg
                className="h-[16px] w-[16px]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                />
              </svg>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
};

export default OurJourney;
