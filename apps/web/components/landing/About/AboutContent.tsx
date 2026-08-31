"use client";

import React from "react";
import { Reveal } from "../Common/Reveal";

const features = [
  {
    title: "Human sovereignty",
    description:
      "You stay in command. Consequential actions route to you: a spend, a publish, a deploy. Approve or reject in one tap.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: "Company memory",
    description:
      "Every decision and lesson accumulates from day one. Your organization gets smarter the longer it works with you.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
  {
    title: "Budget discipline",
    description:
      "Every agent knows its budget. Costs tracked per department and per task. No surprises on the invoice.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    title: "Weekly report",
    description:
      "Every Monday: what happened, what's blocked, what it cost, what's next. Five minutes to read, always.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
      </svg>
    ),
  },
];

const AboutContent: React.FC = () => {
  return (
    <section className="bg-white py-20 md:py-28 lg:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:gap-20 items-center">
          {/* Content */}
          <Reveal>
            <div className="space-y-6">
              {features.map((feature, index) => (
                <div key={index} className="flex gap-4">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-emerald">
                    {feature.icon}
                  </div>
                  <div>
                    <h3 className="mb-1 text-lg font-medium text-navy-950">
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-gray-500">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>

          {/* Command Center Mockup */}
          <Reveal>
            <div className="mx-auto w-full max-w-md">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.1)]">
                {/* Header */}
                <div className="mb-5 flex items-center justify-between">
                  <span className="text-sm font-bold tracking-tight text-navy-950">
                    ORQ8{" "}
                    <span className="text-gray-400">· Command Center</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald animate-pulse" />
                    <span className="h-2 w-2 rounded-full bg-emerald/60 animate-pulse" />
                    <span className="h-2 w-2 rounded-full bg-emerald/30" />
                  </span>
                </div>

                {/* Approval Card */}
                <div className="mb-3 rounded-xl border border-emerald/20 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                      Approval Required
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald">
                      Spend · $250
                    </span>
                  </div>
                  <p className="text-sm leading-relaxed text-gray-600">
                    Marketing requests $250 for a LinkedIn campaign.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <span className="rounded-lg bg-emerald px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
                      Approve
                    </span>
                    <span className="rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Reject
                    </span>
                  </div>
                </div>

                {/* Agents Active */}
                <div className="mb-3 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                      Agents Active
                    </span>
                    <span className="text-lg font-bold text-navy-950">03</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Researcher · Analyzing
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">
                      Writer · Drafting launch post
                    </span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse" />
                  </div>
                </div>

                {/* Weekly Cost */}
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                      Weekly Cost
                    </span>
                    <span className="text-lg font-bold text-navy-950">
                      $14.20
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-emerald">within budget</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};

export default AboutContent;
