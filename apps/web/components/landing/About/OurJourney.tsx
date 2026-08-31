"use client";

import React from "react";
import { Reveal } from "../Common/Reveal";

const OurJourney: React.FC = () => {
  return (
    <section className="bg-gray-50 py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mb-12 md:mb-16">
            <span className="mb-3 block text-xs font-bold uppercase tracking-[0.2em] text-emerald">
              Our Story
            </span>
            <h2 className="text-3xl font-light leading-tight tracking-tight text-navy-950 md:text-4xl">
              Why we built ORQ8
            </h2>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Mission */}
          <Reveal>
            <div className="rounded-2xl border border-gray-200 bg-white p-8 md:p-10 lg:p-12">
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-emerald">
                Our Mission
              </span>
              <h3 className="mb-4 text-2xl font-light leading-tight tracking-tight text-navy-950">
                Make AI organizations accessible to every founder
              </h3>
              <p className="text-sm leading-relaxed text-gray-500 md:text-base">
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
            <div className="rounded-2xl border border-emerald/20 bg-emerald/5 p-8 md:p-10 lg:p-12">
              <span className="mb-4 block text-xs font-bold uppercase tracking-[0.2em] text-emerald">
                Our Vision
              </span>
              <h3 className="mb-4 text-2xl font-light leading-tight tracking-tight text-navy-950">
                A world where one person can run a real company
              </h3>
              <p className="text-sm leading-relaxed text-gray-500 md:text-base">
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
          <div className="mt-16 text-center">
            <p className="mb-6 text-sm text-gray-400">
              Join the first cohort and build your AI organization.
            </p>
            <a
              href="/#waitlist"
              className="inline-flex items-center gap-2 rounded-full bg-emerald px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-emerald/90"
            >
              JOIN THE WAITLIST
              <svg
                className="h-4 w-4"
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
