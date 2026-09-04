"use client";

import React from "react";

const PricingHero: React.FC = () => {
  return (
    <section className="bg-white pt-[120px] md:pt-[160px] lg:pt-[200px] pb-[50px] md:pb-[70px] lg:pb-[90px]">
      <div className="mx-auto max-w-[1200px] px-[20px] md:px-[24px]">
        <div className="max-w-[800px]">
          <span className="mb-[16px] block text-[11px] font-bold uppercase tracking-[0.2em] text-orq8-orange">
            Pricing
          </span>
          <h1 className="mb-[24px] text-[36px] md:text-[48px] lg:text-[56px] font-normal leading-[1.1] tracking-tight text-black">
            Your AI workforce.{" "}
            <span className="text-orq8-green">One operating system.</span>
          </h1>
          <p className="max-w-[600px] text-base md:text-lg leading-relaxed text-gray-500">
            Start with a 7-day trial. Build your AI organization, delegate
            real work, and see what ORQ8 can do for your company.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingHero;
