"use client";

import React, { useState } from "react";
import Link from "next/link";

/* ───────────────────────────────────────────────────────────────
   Pricing — ORQ8 pricing with Work Credits model
   ─────────────────────────────────────────────────────────────── */

interface PricingPlan {
  title: string;
  tagline: string;
  description: string;
  monthlyPrice: string;
  annualPrice: string;
  features: { text: string; included: boolean }[];
  cta: { label: string; href: string };
  popular?: boolean;
}

const pricingPlans: PricingPlan[] = [
  {
    title: "Founder",
    tagline: "Run your company with AI.",
    description:
      "The entry point. 3 AI employees, enough credits to see real work happen.",
    monthlyPrice: "$39",
    annualPrice: "$32",
    features: [
      { text: "3 AI employees", included: true },
      { text: "1,000 included Work Credits", included: true },
      { text: "Executive Agent", included: true },
      { text: "Company Memory", included: true },
      { text: "Goals & Tasks", included: true },
      { text: "Basic Approval Gates", included: true },
      { text: "Core integrations", included: true },
      { text: "Basic audit trail", included: true },
      { text: "Basic analytics", included: true },
      { text: "1 organization", included: true },
    ],
    cta: { label: "Start free trial", href: "/#waitlist" },
  },
  {
    title: "Team",
    tagline: "Build your AI workforce.",
    description:
      "The primary plan. 10 AI employees with advanced capabilities and team collaboration.",
    monthlyPrice: "$99",
    annualPrice: "$79",
    features: [
      { text: "10 AI employees", included: true },
      { text: "4,000 included Work Credits", included: true },
      { text: "Everything in Founder", included: true },
      { text: "Advanced integrations", included: true },
      { text: "API access", included: true },
      { text: "Advanced Approval Gates", included: true },
      { text: "Full audit trail", included: true },
      { text: "Advanced analytics", included: true },
      { text: "Custom AI employees", included: true },
      { text: "Priority execution", included: true },
      { text: "Team collaboration", included: true },
      { text: "Priority support", included: true },
    ],
    cta: { label: "Start free trial", href: "/#waitlist" },
    popular: true,
  },
  {
    title: "Company",
    tagline: "Operate your company through AI.",
    description:
      "Full-scale operations. 25 AI employees with advanced governance and controls.",
    monthlyPrice: "$249",
    annualPrice: "$199",
    features: [
      { text: "25 AI employees", included: true },
      { text: "12,000 included Work Credits", included: true },
      { text: "Everything in Team", included: true },
      { text: "All integrations", included: true },
      { text: "Advanced controls", included: true },
      { text: "Advanced governance", included: true },
      { text: "Advanced memory", included: true },
      { text: "Larger execution limits", included: true },
      { text: "Priority support", included: true },
    ],
    cta: { label: "Start free trial", href: "/#waitlist" },
  },
];

const enterpriseFeatures = [
  "Custom AI workforce size",
  "Custom Work Credit pricing",
  "Unlimited organizations",
  "SSO + SCIM",
  "Advanced security + governance",
  "Dedicated infrastructure options",
  "Custom AI policies",
  "Advanced API limits",
  "SLA + dedicated support",
];

const Pricing: React.FC = () => {
  const [annual, setAnnual] = useState(false);

  return (
    <>
      <div
        className="relative z-[2] bg-center bg-cover bg-no-repeat pt-[70px] md:pt-[90px] lg:pt-[110px] xl:pt-[130px] 2xl:pt-[150px]"
        style={{ backgroundImage: "url(/images/pricing-bg.jpg)" }}
      >
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          {/* Header */}
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[580px] lg:max-w-[680px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
              Pricing
            </span>
            <h2 className="!mb-[12px] md:!mb-[16px] !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px] !text-white">
              Your AI workforce.{" "}
              <span className="text-lime">One operating system.</span>
            </h2>
            <p className="!mb-0 mt-[12px] md:mt-[16px] text-white/60 md:text-[15px] lg:text-md">
              Start with a 7-day trial. Build your AI organization, delegate
              real work, and see what ORQ8 can do for your company.
            </p>

            {/* Annual toggle */}
            <div className="flex items-center justify-center gap-[14px] mt-[24px] md:mt-[30px]">
              <span
                className={`text-[13px] font-medium ${
                  !annual ? "text-white" : "text-white/40"
                }`}
              >
                Monthly
              </span>
              <button
                type="button"
                onClick={() => setAnnual(!annual)}
                className={`relative w-[52px] h-[28px] rounded-full transition-colors ${
                  annual ? "bg-lime" : "bg-white/20"
                }`}
                aria-label={`Switch to ${annual ? "monthly" : "annual"} billing`}
              >
                <span
                  className={`absolute top-[3px] w-[22px] h-[22px] rounded-full transition-all duration-300 ${
                    annual
                      ? "left-[27px] bg-navy-950"
                      : "left-[3px] bg-white"
                  }`}
                />
              </button>
              <span
                className={`text-[13px] font-medium ${
                  annual ? "text-white" : "text-white/40"
                }`}
              >
                Annual
              </span>
              {annual && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-lime/15 text-lime px-[10px] py-[3px] rounded-full">
                  Save ~20%
                </span>
              )}
            </div>
          </div>

          {/* Plans */}
          <div className="md:max-w-[1316px] mx-auto relative top-[140px] -mt-[140px]">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[25px]">
              {pricingPlans.map((plan, index) => {
                const popular = Boolean(plan.popular);
                const price = annual ? plan.annualPrice : plan.monthlyPrice;

                return (
                  <div
                    key={index}
                    className={`lift-card relative border-[2px] md:border-[5px] lg:border-[10px] ${
                      popular ? "border-lime" : "border-white/20"
                    } rounded-[15px] md:rounded-[30px] bg-navy-800 py-[25px] md:py-[35px] lg:py-[45px] px-[18px] md:px-[25px] lg:px-[30px] ${
                      popular ? "xl:-mt-[30px] xl:pb-[60px]" : ""
                    }`}
                  >
                    {popular && (
                      <span className="absolute -top-[14px] left-1/2 -translate-x-1/2 bg-lime text-black text-[10px] font-bold uppercase tracking-[1.8px] rounded-[50px] px-[14px] py-[6px]">
                        Most popular
                      </span>
                    )}

                    {/* Plan name */}
                    <span
                      className={`block mb-[6px] md:mb-[8px] uppercase font-bold tracking-[1.8px] text-xs ${
                        popular ? "text-lime" : "text-white/60"
                      }`}
                    >
                      {plan.title}
                    </span>

                    {/* Tagline */}
                    <p className="!mb-[14px] md:mb-[18px] text-[13px] text-lime/80 font-medium">
                      {plan.tagline}
                    </p>

                    {/* Trial badge */}
                    <span className="inline-block mb-[12px] md:mb-[18px] rounded-[50px] border border-lime/40 text-lime text-[9px] font-bold uppercase tracking-[1.8px] px-[12px] py-[5px]">
                      7 days free
                    </span>

                    {/* Description */}
                    <p className="text-[#8f8f99] -tracking-[0.16px] md:text-[14px] lg:text-[15px] leading-[1.6]">
                      {plan.description}
                    </p>

                    {/* Price */}
                    <div className="mt-[20px] md:mt-[30px] mb-[6px] block leading-none text-white text-[40px] md:text-[45px] lg:text-[55px] font-light -tracking-[2.5px] md:-tracking-[3.6px]">
                      {price}{" "}
                      <span className="text-base md:text-[15px] tracking-[.5px] md:tracking-[1.5px] font-normal text-[#8F8F99] ltr:-ml-[4px] rtl:-mr-[4px]">
                        / mo
                      </span>
                    </div>

                    {annual && (
                      <p className="text-lime/70 text-[12px] font-medium">
                        ${annual
                          ? plan.title === "Founder"
                            ? "390"
                            : plan.title === "Team"
                            ? "948"
                            : "2388"
                          : ""}/year billed annually
                      </p>
                    )}

                    <p className="text-[#8f8f99] -tracking-[0.14px] text-[13px]">
                      Card required. Cancel any time.
                    </p>

                    {/* Features */}
                    <ul className="my-[30px] lg:my-[35px]">
                      {plan.features.map((feature, featureIndex) => (
                        <li
                          key={featureIndex}
                          className="mb-[11px] relative ltr:pl-[30px] rtl:pr-[30px] ltr:md:pl-[35px] rtl:md:pr-[35px] text-white -tracking-[0.16px] md:text-[14px] lg:text-[15px]"
                        >
                          <i className="ri-check-double-line absolute top-1/2 -translate-y-1/2 ltr:-left-[2px] rtl:-right-[2px] text-lime text-[22px] md:text-[24px]"></i>
                          {feature.text}
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <Link
                      href={plan.cta.href}
                      className={`btn-press block w-full rounded-[60px] ${
                        popular
                          ? "bg-lime text-black hover:bg-emerald"
                          : "bg-white/10 text-white hover:bg-lime hover:text-black"
                      } p-[7px] md:p-[10px] uppercase text-xs font-bold tracking-[1.8px] transition-colors`}
                    >
                      <span className="flex items-center justify-center gap-[15px] md:gap-[20px]">
                        {plan.cta.label}{" "}
                        <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-navy-950/15 text-current flex items-center justify-center text-md"></i>
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* Enterprise */}
            <div className="mt-[25px] lift-card border-[2px] md:border-[5px] lg:border-[10px] border-white/20 rounded-[15px] md:rounded-[30px] bg-navy-800 px-[18px] md:px-[30px] lg:px-[45px] py-[25px] md:py-[35px] lg:py-[40px]">
              <div className="flex flex-col lg:flex-row lg:items-center gap-[25px] md:gap-[35px] lg:gap-[50px]">
                <div className="lg:max-w-[280px] lg:flex-shrink-0">
                  <span className="block mb-[10px] md:mb-[15px] uppercase font-bold tracking-[1.8px] text-xs text-white/60">
                    Enterprise
                  </span>
                  <h3 className="!mb-0 !font-light !text-xl md:!text-2xl lg:!text-[28px] -tracking-[1px] md:-tracking-[1.6px] !text-white">
                    Custom AI organizations for larger teams.
                  </h3>
                  <p className="!mb-0 mt-[10px] md:mt-[14px] text-[#8f8f99] md:text-[14px] lg:text-[15px]">
                    Bespoke governance, dedicated infrastructure, and a team that
                    gets you running.
                  </p>
                </div>
                <ul className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-[25px] gap-y-[12px] md:gap-y-[14px]">
                  {enterpriseFeatures.map((feature, featureIndex) => (
                    <li
                      key={featureIndex}
                      className="relative ltr:pl-[28px] rtl:pr-[28px] text-white -tracking-[0.16px] md:text-[14px] lg:text-[15px]"
                    >
                      <i className="ri-check-double-line absolute top-1/2 -translate-y-1/2 ltr:-left-[2px] rtl:-right-[2px] text-lime text-[22px] md:text-[24px]"></i>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="lg:flex-shrink-0">
                  <Link
                    href="/contact/"
                    className="btn-press block w-full lg:w-auto rounded-[60px] bg-white/10 hover:bg-lime hover:text-black p-[7px] md:p-[10px] lg:px-[26px] uppercase text-xs font-bold text-white tracking-[1.8px]"
                  >
                    <span className="flex items-center justify-center gap-[15px] md:gap-[20px]">
                      Contact us{" "}
                      <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                    </span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Pricing;
