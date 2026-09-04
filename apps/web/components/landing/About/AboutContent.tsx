"use client";

import React from "react";

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
    <section className="bg-orq8-dark py-[80px] md:py-[120px] lg:py-[160px]">
      <div className="mx-auto max-w-[1200px] px-[20px] md:px-[24px]">
        <div className="grid grid-cols-1 gap-[60px] lg:grid-cols-2 lg:gap-[80px] items-center">
          {/* Content */}
          <div className="space-y-[32px]">
            {features.map((feature, index) => (
              <div key={index} className="flex gap-[20px]">
                <div className="mt-1 flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border border-white/[0.06] bg-white/[0.03] text-orq8-lime">
                  {feature.icon}
                </div>
                <div>
                  <h3 className="mb-[8px] text-lg font-medium text-white">
                    {feature.title}
                  </h3>
                  <p className="text-md leading-relaxed text-white/50">
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Command Center Mockup */}
          <div className="mx-auto w-full max-w-[420px]">
            <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.03] p-[24px]">
              {/* Header */}
              <div className="mb-[20px] flex items-center justify-between">
                <span className="text-sm font-bold tracking-tight text-white">
                  ORQ8{" "}
                  <span className="text-white/40">· Command Center</span>
                </span>
                <span className="flex items-center gap-[6px]">
                  <span className="h-[6px] w-[6px] rounded-full bg-orq8-lime animate-pulse" />
                  <span className="h-[6px] w-[6px] rounded-full bg-orq8-lime/60 animate-pulse" />
                  <span className="h-[6px] w-[6px] rounded-full bg-orq8-lime/30" />
                </span>
              </div>

              {/* Approval Card */}
              <div className="mb-[12px] rounded-[12px] border border-orq8-lime/20 bg-white/[0.03] p-[20px]">
                <div className="mb-[12px] flex items-center justify-between">
                  <span className="text-3xs font-semibold uppercase tracking-widest text-white/40">
                    Approval Required
                  </span>
                  <span className="text-3xs font-semibold uppercase tracking-widest text-orq8-lime">
                    Spend · $250
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-white/60">
                  Marketing requests $250 for a LinkedIn campaign.
                </p>
                <div className="mt-[16px] flex gap-[8px]">
                  <span className="rounded-[8px] bg-orq8-lime px-[12px] py-[6px] text-[11px] font-bold uppercase tracking-wider text-orq8-dark">
                    Approve
                  </span>
                  <span className="rounded-[8px] border border-white/[0.08] px-[12px] py-[6px] text-[11px] font-bold uppercase tracking-wider text-white/50">
                    Reject
                  </span>
                </div>
              </div>

              {/* Agents Active */}
              <div className="mb-[12px] rounded-[12px] border border-white/[0.06] bg-white/[0.03] p-[20px]">
                <div className="flex items-center justify-between">
                  <span className="text-3xs font-semibold uppercase tracking-widest text-white/40">
                    Agents Active
                  </span>
                  <span className="text-lg font-bold text-white">03</span>
                </div>
                <div className="mt-[12px] flex items-center justify-between">
                  <span className="text-2sm text-white/50">
                    Researcher · Analyzing
                  </span>
                  <span className="h-[5px] w-[5px] rounded-full bg-orq8-lime animate-pulse" />
                </div>
                <div className="mt-[8px] flex items-center justify-between">
                  <span className="text-2sm text-white/50">
                    Writer · Drafting launch post
                  </span>
                  <span className="h-[5px] w-[5px] rounded-full bg-orq8-lime animate-pulse" />
                </div>
              </div>

              {/* Weekly Cost */}
              <div className="rounded-[12px] border border-white/[0.06] bg-white/[0.03] p-[20px]">
                <div className="flex items-center justify-between">
                  <span className="text-3xs font-semibold uppercase tracking-widest text-white/40">
                    Weekly Cost
                  </span>
                  <span className="text-lg font-bold text-white">
                    $14.20
                  </span>
                </div>
                <p className="mt-[4px] text-2sm text-orq8-lime">within budget</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutContent;
