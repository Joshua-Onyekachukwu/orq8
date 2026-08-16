"use client";

import React from "react";
import Link from "next/link";

/* The ORQ8 "command center", the product the hero sells.
   A decorative product visual: the real message lives in the headline copy,
   so the mockup is one labeled image for assistive tech (its fake Approve/Reject
   controls are not interactive). */
const CommandCenter: React.FC = () => {
  return (
    <div
      className="relative w-full max-w-[620px] @container"
      role="img"
      aria-label="ORQ8 command center: a dashboard showing three AI agents active, a $250 approval request awaiting your decision, weekly spend of $14.20 within budget, and the Monday report ready"
    >
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[30px] bg-[radial-gradient(60%_60%_at_70%_0%,rgba(96,93,255,0.35),transparent_70%)] blur-2xl"
      />
      <div aria-hidden className="relative rounded-[26px] bg-white/5 ring-1 ring-white/10 p-[7px] shadow-[0_24px_70px_-24px_rgba(0,0,0,0.7)]">
        <div className="rounded-[20px] bg-navy-800 border border-white/10 p-[20px] md:p-[24px]">
          {/* header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-[14px]">
            <span className="flex items-center gap-[8px] uppercase font-bold tracking-[1.8px] text-[11px] text-white/60">
              <span className="w-[8px] h-[8px] rounded-full bg-lime inline-block"></span>
              ORQ8 · Command Center
            </span>
            <span className="flex items-center gap-[6px]">
              <span className="w-[7px] h-[7px] rounded-full bg-lime animate-pulse-dot"></span>
              <span className="w-[7px] h-[7px] rounded-full bg-white/25"></span>
              <span className="w-[7px] h-[7px] rounded-full bg-white/25"></span>
            </span>
          </div>

          {/* stats */}
          <div className="grid grid-cols-3 divide-x divide-white/10 mt-[16px] text-center">
            {[
              { k: "Agents active", v: "03" },
              { k: "Tasks this week", v: "14" },
              { k: "Weekly spend", v: "$14.20" },
            ].map((s) => (
              <div key={s.k} className="px-[8px]">
                <p className="text-[26px] font-light leading-none text-white -tracking-[1px]">
                  {s.v}
                </p>
                <p className="mt-[8px] uppercase tracking-[1.4px] text-[9px] text-white/40">
                  {s.k}
                </p>
              </div>
            ))}
          </div>

          {/* dashboard grid */}
          <div className="grid grid-cols-1 @sm:grid-cols-2 gap-[16px] mt-[16px]">
            {/* main column */}
            <div className="space-y-[16px]">
              {/* approval */}
              <div className="rounded-[14px] bg-navy-900 border border-lime/30 p-[16px]">
                <div className="flex items-center gap-[10px]">
                  <span className="w-[24px] h-[24px] rounded-full bg-lime text-black text-[12px] font-bold flex items-center justify-center">
                    !
                  </span>
                  <p className="uppercase font-bold tracking-[1.8px] text-[10px] text-lime">
                    Approval required
                  </p>
                </div>
                <p className="mt-[12px] text-[14px] text-white/90 leading-[1.5]">
                  Marketing requests{" "}
                  <span className="text-lime font-semibold">$250</span> for a
                  LinkedIn campaign.
                </p>
                <div className="mt-[14px] flex gap-[10px]">
                  <span className="flex-1 text-center rounded-[50px] bg-lime text-black text-[12px] font-bold py-[8px]">
                    Approve
                  </span>
                  <span className="flex-1 text-center rounded-[50px] border border-white/20 text-white/80 text-[12px] py-[8px]">
                    Reject
                  </span>
                </div>
              </div>

              {/* weekly cost */}
              <div className="flex items-center justify-between rounded-[14px] bg-white/5 border border-white/10 px-[16px] py-[12px]">
                <div>
                  <p className="uppercase font-bold tracking-[1.8px] text-[10px] text-white/40">
                    Weekly cost
                  </p>
                  <p className="mt-[6px] text-[20px] font-light text-white -tracking-[0.8px]">
                    $14.20{" "}
                    <span className="text-[11px] text-lime tracking-[0.4px]">
                      within budget
                    </span>
                  </p>
                </div>
                <svg viewBox="0 0 110 32" className="h-[32px] w-[110px]" aria-hidden>
                  <path
                    d="M0 26 L14 22 L28 24 L42 17 L56 19 L70 12 L84 15 L98 7 L110 9"
                    fill="none"
                    stroke="#c8ff32"
                    strokeWidth={2}
                  />
                  <path
                    d="M0 26 L14 22 L28 24 L42 17 L56 19 L70 12 L84 15 L98 7 L110 9 L110 32 L0 32 Z"
                    fill="#c8ff32"
                    opacity={0.12}
                  />
                </svg>
              </div>
            </div>

            {/* side column */}
            <div className="space-y-[16px]">
              {/* active agents */}
              <div className="rounded-[14px] bg-white/5 border border-white/10 p-[14px]">
                <p className="uppercase font-bold tracking-[1.8px] text-[10px] text-white/40 mb-[10px]">
                  Active now
                </p>
                <div className="space-y-[8px]">
                  {[
                    { n: "Researcher · α", s: "Analyzing market data" },
                    { n: "Writer · α", s: "Drafting launch post" },
                    { n: "Engineer · α", s: "Reviewing PR #142" },
                  ].map((a) => (
                    <div
                      key={a.n}
                      className="flex items-center justify-between gap-[6px] rounded-[10px] bg-navy-900/60 border border-white/10 px-[12px] py-[9px]"
                    >
                      <p className="font-medium text-white/85 text-[12px] -tracking-[0.2px]">
                        {a.n}
                      </p>
                      <p className="flex items-center gap-[7px] text-white/55 text-[12px]">
                        <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
                        {a.s}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* monday report */}
              <div className="flex items-center gap-[10px] rounded-[14px] bg-white/5 border border-white/10 px-[16px] py-[12px]">
                <span className="w-[7px] h-[7px] rounded-full bg-lime animate-pulse-dot"></span>
                <p className="uppercase font-bold tracking-[1.8px] text-[10px] text-white/60">
                  Monday report · Ready
                </p>
                <span className="ml-auto uppercase tracking-[1.4px] text-[10px] text-white/35">
                  Aug 15
                </span>
              </div>

              {/* dept budgets */}
              <div className="hidden @sm:block rounded-[14px] bg-white/5 border border-white/10 px-[16px] py-[14px]">
                <p className="uppercase font-bold tracking-[1.8px] text-[10px] text-white/40 mb-[10px]">
                  Dept budgets
                </p>
                <div className="space-y-[10px]">
                  {[
                    { d: "Marketing", pct: "62%" },
                    { d: "Engineering", pct: "47%" },
                  ].map((b) => (
                    <div key={b.d}>
                      <div className="flex items-center justify-between text-[11px] mb-[5px]">
                        <span className="text-white/70">{b.d}</span>
                        <span className="text-white/45">{b.pct}</span>
                      </div>
                      <div className="h-[4px] rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-lime"
                          style={{ width: b.pct }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const HeroBanner: React.FC = () => {
  return (
    <>
      <div className="bg-navy-950">
        <div className="xl:max-w-[1920px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            {/* Left: product visual panel */}
            <div className="relative bg-cover bg-no-repeat bg-center h-[840px] sm:h-[820px] lg:h-full ltr:lg:mr-[100px] rtl:lg:ml-[100px] ltr:xl:mr-[215px] rtl:xl:ml-[215px] overflow-hidden">
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(80% 60% at 20% 0%, rgba(96,93,255,0.28), transparent 60%), radial-gradient(70% 55% at 90% 100%, rgba(200,255,50,0.12), transparent 60%), linear-gradient(180deg, #0D1427 0%, #16203f 100%)",
                }}
              />
              <div
                aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                  backgroundSize: "56px 56px",
                  maskImage:
                    "radial-gradient(80% 80% at 50% 40%, black, transparent 85%)",
                  WebkitMaskImage:
                    "radial-gradient(80% 80% at 50% 40%, black, transparent 85%)",
                }}
              />
              <div className="relative flex h-full items-center justify-center px-[20px] py-[60px]">
                <CommandCenter />
              </div>
              <div className="absolute top-[18%] ltr:right-[6%] rtl:left-[6%] animate-bounce-slow rounded-[14px] bg-navy-800 border border-white/10 px-[16px] py-[12px] shadow-2xl">
                <p className="uppercase font-bold tracking-[1.8px] text-[10px] text-lime">
                  +1 agent hired
                </p>
                <p className="mt-[4px] text-[12px] text-white/60">
                  Marketing specialist · this week
                </p>
              </div>
            </div>

            {/* Right: headline, proof, CTA */}
            <div className="relative py-[60px] md:py-[80px] lg:pt-[260px] lg:pb-[160px] ltr:lg:pl-[60px] rtl:lg:pr-[60px] ltr:xl:pl-0 rtl:xl:pr-0 ltr:2xl:pl-[95px] rtl:2xl:pr-[95px]">
              <div className="px-[12px] 2xl:px-0 mx-auto 2xl:mx-0 sm:max-w-[540px] md:max-w-[720px] lg:max-w-full 2xl:max-w-[720px]">
                <span className="inline-block py-[8px] md:py-[10px] px-[13px] md:px-[16px] font-bold text-[11px] md:text-xs bg-lime rounded-[10px] text-black tracking-[1.8px] mb-[16px] md:mb-[20px]">
                  THE AI ORGANIZATION OPERATING SYSTEM
                </span>

                <h1 className="!mb-[15px] lg:!mb-[20px] !text-white !font-light !text-[35px] md:!text-[50px] lg:!text-[60px] xl:!text-[76px] 2xl:!text-[86px] !leading-[1.08] -tracking-[2px] md:-tracking-[3px] xl:-tracking-[4px] text-balance">
                  Run an actual company of{" "}
                  <span className="font-bold text-lime">One</span>
                </h1>

                <p className="lg:text-md xl:text-lg text-white/75 max-w-[560px]">
                  You set the direction. ORQ8 hires the AI team, does the work,
                  and reports back under your approvals and your budget.
                </p>

                <Link
                  href="/#waitlist"
                  className="btn-press group inline-block text-center bg-lime rounded-[50px] text-navy-950 font-semibold md:text-[15px] lg:text-md xl:text-[17px] py-[11px] px-[26px] hover:bg-emerald mt-[5px] md:mt-[10px] lg:mt-[18px] xl:mt-[22px]"
                >
                  <span className="inline-flex items-center gap-[10px] ltr:pr-[6px] rtl:pl-[6px]">
                    Join the waitlist{" "}
                    <i className="ri-arrow-right-line text-[20px] transition-transform duration-300 group-hover:translate-x-[3px]"></i>
                  </span>
                </Link>

                <div className="mt-[28px] lg:mt-[48px] flex flex-col sm:flex-row sm:items-center gap-[14px] sm:gap-[22px] border border-white/15 bg-white/10 rounded-[24px] p-[16px] md:p-[20px] max-w-[480px] backdrop-blur-md">
                  <div className="flex items-center">
                    {["S", "A", "M"].map((letter, i) => (
                      <div
                        key={i}
                        aria-hidden="true"
                        className="flex items-center justify-center w-[42px] h-[42px] md:w-[46px] md:h-[46px] rounded-full border-[2px] border-white bg-lime/15 text-lime font-bold text-sm ltr:-mr-[16px] rtl:-ml-[16px]"
                      >
                        {letter}
                      </div>
                    ))}
                    <div className="flex items-center justify-center w-[42px] h-[42px] md:w-[46px] md:h-[46px] rounded-full border-[2px] border-white bg-primary-500 text-white text-xl">
                      <i className="ri-add-line"></i>
                    </div>
                  </div>
                  <span className="block lg:text-md leading-relaxed text-white/90">
                    1,000+ founders in the queue. First cohort opens soon.
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default HeroBanner;
