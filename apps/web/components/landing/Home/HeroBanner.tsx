"use client";

import React from "react";
import Link from "next/link";

const HeroBanner: React.FC = () => {
  return (
    <>
      <div className="relative z-[1] pt-[120px] md:pt-[150px] lg:pt-[170px] dark:bg-[#0a0e19] overflow-hidden">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="text-center">
            {/* Eyebrow badge — Trezo style */}
            <div
              className="md:max-w-[514px] uppercase text-xs font-bold tracking-[1.8px] rounded-[10px] md:rounded-[50px] border border-hairline dark:border-gray-800 p-[9px] bg-white/40 dark:bg-dark/40 text-emerald md:flex items-center gap-[10px] mx-auto justify-center mb-[15px]"
              style={{ backdropFilter: "blur(40px)" }}
            >
              <span className="flex items-center gap-2">
                <span className="w-[8px] h-[8px] rounded-full bg-emerald animate-pulse"></span>
                AI ORGANIZATION OPERATING SYSTEM
              </span>
            </div>

            {/* Headline — Trezo large light font style */}
            <h1 className="!font-light !text-[35px] md:!text-[50px] lg:!text-[80px] xl:!text-[100px] -tracking-[1.7px] md:-tracking-[3px] lg:-tracking-[5px] xl:-tracking-[11px] !leading-[1.1] !mb-[20px] md:!mb-[25px] lg:!mb-[30px] xl:!mb-[35px]">
              Run a company{" "}
              <span className="text-emerald italic">of one</span>
            </h1>

            {/* Pill CTA — Trezo Finance style */}
            <Link
              href="/register"
              className="inline-block rounded-[60px] bg-emerald p-[7px] md:p-[10px] uppercase text-xs font-bold text-white tracking-[1px] md:tracking-[1.8px] transition-all hover:bg-emerald-dark hover:text-white"
            >
              <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                GET STARTED{" "}
                <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
              </span>
            </Link>
          </div>

          {/* Trust signals */}
          <div className="text-center mt-[40px] md:mt-[60px]">
            <p className="text-sm text-ink-faint dark:text-white/40">
              7-day free trial · No credit card required · Cancel anytime
            </p>
          </div>
        </div>

        {/* Gradient background — Trezo style, adapted to ORQ8 emerald */}
        <div
          className="absolute top-0 left-0 right-0 bottom-0 bg-cover bg-center bg-no-repeat -z-[1] dark:hidden"
          style={{
            background: "linear-gradient(180deg, #e8faf0 0%, #ffffff 100%)",
          }}
        ></div>
        <div className="absolute bg-white dark:bg-[#0a0e19] h-[100px] left-0 right-0 bottom-0 -z-[1]"></div>
      </div>
    </>
  );
};

export default HeroBanner;
