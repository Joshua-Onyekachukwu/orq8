"use client";

import React from "react";
import Link from "next/link";
import { HeroLightField } from "./HeroLightField";

const HeroBanner: React.FC = () => {
  return (
    <div className="relative z-[1] min-h-screen flex items-center overflow-hidden ink">
      {/* Surface. The grid is the hero's material: a light field moving across it
          is what the cursor drives, in place of the two blurred glow orbs. */}
      <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",backgroundSize:"60px 60px"}} />

      {/* Cursor light field: token-derived, behind the content, off on touch and
          under reduced motion. */}
      <HeroLightField />

      <div className="relative z-10 container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px] pt-[160px] md:pt-[200px] lg:pt-[240px] pb-[80px]">
        <div className="text-center mx-auto lg:max-w-[780px]">
          {/* Eyebrow, and the hero's one glass layer: a single physical surface
              above the page, with a hairline and a soft shadow. It blurs the
              light field behind it, which is the point of the treatment. The
              hairline uses `--orq-ink-accent` rather than `brand-soft`, because
              inside the band brand-soft is the dark wash and would vanish. */}
          <div
            className="relative inline-flex items-center gap-[10px] rounded-full border bg-white/5 backdrop-blur-[6px] shadow-[0_8px_24px_-14px_rgb(0_0_0_/_0.7)] px-[18px] py-[8px] mb-[28px] md:mb-[32px]"
            style={{ borderColor: "color-mix(in srgb, var(--orq-ink-accent) 22%, transparent)" }}
          >
            <span className="w-[6px] h-[6px] rounded-full bg-ink-accent" />
            <span className="uppercase text-overline font-bold tracking-[1.8px] text-ink-accent">
              AI Organization Operating System
            </span>
          </div>

          {/* Headline */}
          <h1 className="uppercase !font-bold !text-[36px] md:!text-[52px] lg:!text-[68px] xl:!text-[80px] !tracking-[-1px] md:!tracking-[-2px] lg:!tracking-[-3px] !leading-[1.05] !mb-[20px] md:!mb-[24px] lg:!mb-[28px]">
            <span className="text-white">Run a company </span>
            <span className="text-ink-accent">of one</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-white text-md md:text-[17px] lg:text-[19px] max-w-[580px] mx-auto !mb-[32px] md:!mb-[40px] !leading-relaxed">
            You set the direction. ORQ8 builds and manages your AI workforce to execute the work — while you stay in control of approvals and budget.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-[14px]">
            <Link href="/register" className="group inline-block rounded-full bg-brand-deep px-[28px] py-[14px] uppercase text-overline font-bold text-white tracking-[1.8px] transition-all hover:bg-ink-accent hover:text-ink-surface">
              <span className="flex items-center justify-center gap-[12px]">
                Get Started
                <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-white/15 text-white flex items-center justify-center text-2sm transition-colors group-hover:bg-ink-surface/15 group-hover:text-ink-surface" />
              </span>
            </Link>
            <Link href="/about" className="group inline-block rounded-full border border-white/15 bg-white/5 backdrop-blur-sm px-[28px] py-[14px] uppercase text-overline font-bold text-white/70 tracking-[1.8px] transition-all hover:border-ink-accent/60 hover:text-white hover:bg-white/10">
              <span className="flex items-center justify-center gap-[12px]">
                Learn More
                <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-white/10 text-white/60 flex items-center justify-center text-2sm transition-colors group-hover:bg-ink-accent/20 group-hover:text-ink-accent" />
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
