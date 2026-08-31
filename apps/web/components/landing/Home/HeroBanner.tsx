"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

const HeroBanner: React.FC = () => {
  return (
    <div className="bg-navy-950">
      <div className="xl:max-w-[1920px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left — headline, proof, CTA */}
          <div className="relative order-1 py-[110px] md:py-[140px] pb-[60px] md:pb-[80px] lg:pt-[300px] lg:pb-[160px] ltr:lg:pl-[60px] rtl:lg:pr-[60px] ltr:xl:pl-0 rtl:xl:pr-0 ltr:2xl:pl-[95px] rtl:2xl:pr-[95px]">
            <div className="px-[12px] 2xl:px-0 mx-auto 2xl:mx-0 sm:max-w-[540px] md:max-w-[720px] lg:max-w-full 2xl:max-w-[720px]">
              <span className="inline-block py-[8px] md:py-[10px] px-[13px] md:px-[16px] font-bold text-[11px] md:text-xs bg-lime rounded-[10px] text-black tracking-[1.8px] mb-[16px] md:mb-[20px]">
                THE AI ORGANIZATION OPERATING SYSTEM
              </span>

              <h1 className="!mb-[15px] lg:!mb-[20px] !text-white !font-light uppercase !text-[35px] md:!text-[50px] lg:!text-[60px] xl:!text-[76px] 2xl:!text-[86px] !leading-[1.08] -tracking-[2px] md:-tracking-[3px] xl:-tracking-[4px] text-balance">
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
                  {[1, 2, 3].map((n) => (
                    <div
                      key={n}
                      aria-hidden="true"
                      className="w-[42px] h-[42px] md:w-[46px] md:h-[46px] rounded-full overflow-hidden border-[2px] border-white flex-none ltr:-mr-[16px] rtl:-ml-[16px]"
                    >
                      <Image
                        src={`/images/founders/founder-${n}.jpg`}
                        alt=""
                        width={46}
                        height={46}
                        className="w-full h-full object-cover"
                      />
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

          {/* Right — dashboard mockup panel */}
          <div className="relative order-2 h-[500px] sm:h-[600px] lg:h-full ltr:lg:mr-[100px] rtl:lg:ml-[100px] ltr:xl:mr-[215px] rtl:xl:ml-[215px] overflow-hidden rounded-l-[30px] lg:rounded-[30px] flex items-center justify-center">
            {/* Gradient background */}
            <div className="absolute inset-0 bg-gradient-to-br from-navy-900 via-navy-950 to-navy-900" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(52,211,153,0.08)_0%,transparent_70%)]" />
            {/* Dashboard card mockup */}
            <div className="relative z-10 w-[85%] max-w-[380px] rounded-2xl border border-white/10 bg-navy-surface/90 p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.6)] backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/50">ORQ8 · Command Center</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald animate-pulse"></span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-semibold text-white">03</p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/40">Agents</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-white">14</p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/40">Tasks</p>
                </div>
                <div>
                  <p className="text-xl font-semibold text-white">$14</p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.15em] text-white/40">Spend</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {['Researcher · Analyzing data', 'Writer · Drafting post', 'Engineer · Reviewing PR'].map((t) => (
                  <div key={t} className="flex items-center gap-2 rounded-lg border border-white/8 bg-navy-950/60 px-3 py-2">
                    <span className="h-1 w-1 rounded-full bg-emerald shrink-0"></span>
                    <span className="font-mono text-[9px] text-white/70 truncate">{t}</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 rounded-xl border border-emerald/25 bg-navy-950/60 p-3">
                <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-emerald">Approval required</p>
                <p className="mt-1 text-[11px] text-white/80">Marketing requests <span className="text-emerald font-semibold">$250</span> for LinkedIn</p>
              </div>
            </div>
            {/* Floating badge */}
            <div className="absolute top-[15%] right-[5%] rounded-xl border border-emerald/30 bg-navy-950/95 px-3 py-2 shadow-lg">
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-emerald">+1 agent hired</p>
              <p className="text-[10px] text-white/60">Marketing · this week</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroBanner;
