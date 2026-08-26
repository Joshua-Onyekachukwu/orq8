"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

const HeroBanner: React.FC = () => {
  return (
    <section className="relative min-h-[90vh] md:min-h-[85vh] flex items-center justify-center overflow-hidden">
      {/* Background image layer */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: "url('/hero-bg.png')",
          backgroundPosition: "center 30%",
        }}
      />

      {/* Dark overlay layer */}
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(10, 14, 25, 0.55)",
        }}
      />

      {/* Additional gradient overlay for depth */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,14,25,0.3) 0%, rgba(10,14,25,0.5) 40%, rgba(10,14,25,0.7) 100%)",
        }}
      />

      {/* Content - centered container */}
      <div className="relative z-10 w-full max-w-3xl mx-auto px-5 py-20 md:py-24 text-center">
        {/* Badge */}
        <span className="inline-block py-[8px] md:py-[10px] px-[13px] md:px-[16px] font-bold text-[11px] md:text-xs bg-lime rounded-[10px] text-black tracking-[1.8px] mb-[16px] md:mb-[20px]">
          THE AI ORGANIZATION OPERATING SYSTEM
        </span>

        {/* Main heading */}
        <h1 className="!mb-[15px] lg:!mb-[20px] !text-white !font-medium uppercase !text-[35px] md:!text-[50px] lg:!text-[60px] xl:!text-[76px] 2xl:!text-[86px] !leading-[1.04] -tracking-[1px] md:-tracking-[1.5px] xl:-tracking-[2px] text-balance">
          Run an actual company of{" "}
          <span className="font-bold text-lime">One</span>
        </h1>

        {/* Subheading */}
        <p className="mx-auto lg:text-md xl:text-lg text-white/75 max-w-[560px]">
          You set the direction. ORQ8 hires the AI team, does the work,
          and reports back under your approvals and your budget.
        </p>

        {/* CTA */}
        <div className="mt-[5px] md:mt-[10px] lg:mt-[18px] xl:mt-[22px]">
          <Link
            href="/#waitlist"
            className="btn-press group inline-block text-center bg-lime rounded-[50px] text-navy-950 font-semibold md:text-[15px] lg:text-md xl:text-[17px] py-[11px] px-[26px] hover:bg-emerald"
          >
            <span className="inline-flex items-center gap-[10px] ltr:pr-[6px] rtl:pl-[6px]">
              Join the waitlist{" "}
              <i className="ri-arrow-right-line text-[20px] transition-transform duration-300 group-hover:translate-x-[3px]"></i>
            </span>
          </Link>
        </div>

        {/* Social proof with founder avatars */}
        <div className="mt-[28px] lg:mt-[48px] inline-flex items-center gap-[14px] sm:gap-[22px] border border-white/15 bg-white/10 rounded-[24px] p-[16px] md:p-[20px] backdrop-blur-md">
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
          <span className="lg:text-md leading-relaxed text-white/90">
            1,000+ founders in the queue. First cohort opens soon.
          </span>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;
