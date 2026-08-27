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

          {/* Right — background image panel */}
          <div className="relative order-2 h-[500px] sm:h-[600px] lg:h-full ltr:lg:mr-[100px] rtl:lg:ml-[100px] ltr:xl:mr-[215px] rtl:xl:ml-[215px] overflow-hidden rounded-l-[30px] lg:rounded-[30px]">
            <Image
              src="/images/hero-bg.png"
              alt=""
              fill
              className="object-cover object-center"
              priority
            />
            {/* Subtle gradient overlay for depth */}
            <div className="absolute inset-0 bg-gradient-to-r from-navy-950/30 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroBanner;
