"use client";

import React from "react";
import Link from "next/link";

const HeroBanner: React.FC = () => {
  return (
    <div className="relative z-[1] min-h-screen flex items-center overflow-hidden bg-orq8-dark">
      {/* Grid texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",backgroundSize:"60px 60px"}} />

      {/* Glow orbs */}
      <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] rounded-full bg-orq8-lime/[0.06] blur-[120px]" />
      <div className="absolute bottom-[-15%] left-[-8%] w-[500px] h-[500px] rounded-full bg-orq8-orange/[0.04] blur-[100px]" />

      <div className="relative z-10 container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px] pt-[160px] md:pt-[200px] lg:pt-[240px] pb-[80px]">
        <div className="text-center mx-auto lg:max-w-[780px]">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-[10px] rounded-full border border-white/10 bg-white/5 backdrop-blur-sm px-[18px] py-[8px] mb-[28px] md:mb-[32px]">
            <span className="w-[6px] h-[6px] rounded-full bg-orq8-lime animate-pulse" />
            <span className="uppercase text-overline font-bold tracking-[1.8px] text-orq8-lime">
              AI Organization Operating System
            </span>
          </div>

          {/* Headline */}
          <h1 className="uppercase !font-bold !text-[36px] md:!text-[52px] lg:!text-[68px] xl:!text-[80px] !tracking-[-1px] md:!tracking-[-2px] lg:!tracking-[-3px] !leading-[1.05] !mb-[20px] md:!mb-[24px] lg:!mb-[28px]">
            <span className="text-white">Run a company </span>
            <span className="text-orq8-lime">of one</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-white text-md md:text-[17px] lg:text-[19px] max-w-[580px] mx-auto !mb-[32px] md:!mb-[40px] !leading-relaxed">
            You set the direction. ORQ8 builds and manages your AI workforce to execute the work — while you stay in control of approvals and budget.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-[14px]">
            <Link href="/register" className="inline-block rounded-full bg-orq8-orange px-[28px] py-[14px] uppercase text-overline font-bold text-white tracking-[1.8px] transition-all hover:bg-orq8-orange-dark">
              <span className="flex items-center justify-center gap-[12px]">
                Get Started
                <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-white/15 text-white flex items-center justify-center text-2sm" />
              </span>
            </Link>
            <Link href="/about" className="inline-block rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-[28px] py-[14px] uppercase text-overline font-bold text-white/70 tracking-[1.8px] transition-all hover:border-white/30 hover:text-white hover:bg-white/10">
              <span className="flex items-center justify-center gap-[12px]">
                Learn More
                <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-white/10 text-white/60 flex items-center justify-center text-2sm" />
              </span>
            </Link>
          </div>

          {/* Trust signal */}
          <p className="text-white/60 text-xs mt-[28px] md:mt-[36px] tracking-wide">
            7-day free trial · No credit card required · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  );
};

export default HeroBanner;
