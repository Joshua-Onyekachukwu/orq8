"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

/* The ORQ8 "command center" — the product the hero sells.
   A decorative product visual: the real message lives in the headline copy,
   so the mockup is one labeled image for assistive tech (its fake Approve/Reject
   controls are not interactive). */
const CommandCenter: React.FC = () => {
  return (
    <div className="relative w-full max-w-[480px]" role="img" aria-label="ORQ8 command center: three AI agents active, a $250 approval request awaiting your decision, and weekly spend of $14.20 within budget">
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[30px] bg-[radial-gradient(60%_60%_at_70%_0%,rgba(96,93,255,0.35),transparent_70%)] blur-2xl"
      />
      <div aria-hidden className="relative rounded-[20px] bg-navy-800 border border-white/10 p-[22px] md:p-[28px]">
        {/* header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-[16px]">
          <span className="uppercase font-bold tracking-[1.8px] text-[11px] text-white/60">
            ORQ8 · Command Center
          </span>
          <span className="flex items-center gap-[6px]">
            <span className="w-[7px] h-[7px] rounded-full bg-lime"></span>
            <span className="w-[7px] h-[7px] rounded-full bg-white/25"></span>
            <span className="w-[7px] h-[7px] rounded-full bg-white/25"></span>
          </span>
        </div>

        {/* stats */}
        <div className="grid grid-cols-3 divide-x divide-white/10 mt-[20px] text-center">
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

        {/* active agents */}
        <div className="mt-[20px] pt-[16px] border-t border-white/10 space-y-[10px]">
          <p className="uppercase font-bold tracking-[1.8px] text-[10px] text-white/40 mb-[12px]">
            Active now
          </p>
          {[
            { n: "Researcher · α", s: "Analyzing market data" },
            { n: "Writer · α", s: "Drafting launch post" },
            { n: "Engineer · α", s: "Reviewing PR #142" },
          ].map((a) => (
            <div
              key={a.n}
              className="flex items-center justify-between rounded-[10px] bg-white/5 border border-white/10 px-[14px] py-[10px]"
            >
              <p className="font-medium text-white/85 text-[13px] -tracking-[0.2px]">
                {a.n}
              </p>
              <p className="flex items-center gap-[7px] text-white/50 text-[13px]">
                <span className="w-[6px] h-[6px] rounded-full bg-lime"></span>
                {a.s}
              </p>
            </div>
          ))}
        </div>

        {/* approval */}
        <div className="mt-[16px] rounded-[14px] bg-navy-900 border border-lime/30 p-[16px]">
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
        <div className="mt-[16px] flex items-center justify-between rounded-[14px] bg-white/5 border border-white/10 px-[16px] py-[12px]">
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

        <div className="mt-[16px] flex items-center gap-[10px] rounded-[14px] bg-white/5 border border-white/10 px-[16px] py-[12px]">
          <span className="w-[7px] h-[7px] rounded-full bg-lime"></span>
          <p className="uppercase font-bold tracking-[1.8px] text-[10px] text-white/60">
            Monday report · Ready
          </p>
          <span className="ml-auto uppercase tracking-[1.4px] text-[10px] text-white/30">
            Aug 15
          </span>
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
            {/* Left — product visual panel */}
            <div className="relative bg-cover bg-no-repeat bg-center h-[460px] sm:h-[620px] lg:h-full ltr:lg:mr-[100px] rtl:lg:ml-[100px] ltr:xl:mr-[215px] rtl:xl:ml-[215px] overflow-hidden">
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

            {/* Right — headline, proof, CTA */}
            <div className="relative py-[60px] md:py-[80px] lg:pt-[260px] lg:pb-[160px] ltr:lg:pl-[60px] rtl:lg:pr-[60px] ltr:xl:pl-0 rtl:xl:pr-0 ltr:2xl:pl-[95px] rtl:2xl:pr-[95px]">
              <div className="px-[12px] 2xl:px-0 mx-auto 2xl:mx-0 sm:max-w-[540px] md:max-w-[720px] lg:max-w-full 2xl:max-w-[720px]">
                <span className="inline-block py-[8px] md:py-[10px] px-[13px] md:px-[16px] font-bold text-[11px] md:text-xs bg-lime rounded-[10px] text-black tracking-[1.8px] mb-[16px] md:mb-[20px]">
                  THE AI ORGANIZATION OPERATING SYSTEM
                </span>

                <h1 className="!mb-[15px] lg:!mb-[20px] !text-white !font-light !text-[35px] md:!text-[50px] lg:!text-[60px] xl:!text-[76px] 2xl:!text-[86px] !leading-[1.08] -tracking-[2px] md:-tracking-[3px] xl:-tracking-[4px]">
                  Run your company with{" "}
                  <span className="font-bold text-lime">AI employees</span>
                </h1>

                <p className="lg:text-md xl:text-lg text-white/75 max-w-[560px]">
                  You set the direction. ORQ8 hires the team, does the work, and
                  reports back — under your approvals, your budgets, your audit
                  trail. One person. One company. An entire AI workforce.
                </p>

                <Link
                  href="/#waitlist"
                  className="btn-press inline-block text-center bg-orange-500 border border-orange-500 rounded-[50px] text-white font-medium md:text-[15px] lg:text-md xl:text-[17px] py-[9px] px-[22px] hover:bg-primary-500 hover:border-primary-500 mt-[5px] md:mt-[10px] lg:mt-[18px] xl:mt-[22px]"
                >
                  <span className="inline-block relative ltr:pr-[27px] rtl:pl-[27px]">
                    Start Free — No Credit Card{" "}
                    <i className="ri-arrow-right-long-line text-[20px] absolute top-1/2 -translate-y-1/2 ltr:-right-[2px] rtl:-left-[2px]"></i>
                  </span>
                </Link>

                <div className="mt-[25px] lg:mt-[45px] flex items-center gap-[10px] md:gap-[15px] border border-white/15 bg-white/10 rounded-[100px] p-[10px] md:p-[13px] max-w-[360px] backdrop-blur-sm">
                  <div className="flex items-center">
                    <Image
                      src="/images/users/user1.jpg"
                      className="inline-block rounded-full border-[2px] border-white w-[42px] md:w-[46px] ltr:-mr-[16px] rtl:-ml-[16px]"
                      alt="founder"
                      width={55}
                      height={55}
                    />
                    <Image
                      src="/images/users/user2.jpg"
                      className="inline-block rounded-full border-[2px] border-white w-[42px] md:w-[46px] ltr:-mr-[16px] rtl:-ml-[16px]"
                      alt="founder"
                      width={55}
                      height={55}
                    />
                    <Image
                      src="/images/users/user3.jpg"
                      className="inline-block rounded-full border-[2px] border-white w-[42px] md:w-[46px] ltr:-mr-[16px] rtl:-ml-[16px]"
                      alt="founder"
                      width={55}
                      height={55}
                    />
                    <div className="flex items-center justify-center w-[42px] h-[42px] md:w-[46px] md:h-[46px] rounded-full border-[2px] border-white bg-primary-500 text-white text-xl">
                      <i className="ri-add-line"></i>
                    </div>
                  </div>
                  <span className="block lg:text-md text-white/90 ltr:mr-[10px] rtl:ml-[10px] ltr:md:mr-[15px] rtl:md:ml-[15px]">
                    1,000+ founders in the queue — first cohort opens soon
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
