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
    <div className="relative z-[2] bg-[#0A0A0B] py-[80px] md:py-[120px] lg:py-[160px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1200px] mx-auto px-[20px] md:px-[24px]">
        {/* Header */}
        <div className="mb-[50px] md:mb-[60px] lg:mb-[70px] mx-auto text-center md:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[0.2em] text-[11px] text-[#B8FF66] mb-[16px]">
            Pricing
          </span>
          <h2 className="!text-white !mb-[16px] md:!mb-[20px] !font-normal !text-[32px] md:!text-[40px] lg:!text-[48px] -tracking-[0.5px] md:-tracking-[1px]">
            Your AI workforce.{" "}
            <span className="text-[#B8FF66]">One operating system.</span>
          </h2>
          <p className="!mb-0 mt-[16px] text-white/50 md:text-[16px]">
            Start with a 7-day trial. Build your AI organization, delegate
            real work, and see what ORQ8 can do for your company.
          </p>

          {/* Annual toggle */}
          <div className="flex items-center justify-center gap-[16px] mt-[32px] md:mt-[40px]">
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
                annual ? "bg-[#B8FF66]" : "bg-white/20"
              }`}
              aria-label={`Switch to ${annual ? "monthly" : "annual"} billing`}
            >
              <span
                className={`absolute top-[3px] w-[22px] h-[22px] rounded-full transition-all duration-300 ${
                  annual
                    ? "left-[27px] bg-[#0A0A0B]"
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
              <span className="text-[10px] font-bold uppercase tracking-wider bg-[#B8FF66]/15 text-[#B8FF66] px-[12px] py-[4px] rounded-full">
                Save ~20%
              </span>
            )}
          </div>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[24px]">
          {pricingPlans.map((plan, index) => {
            const popular = Boolean(plan.popular);
            const price = annual ? plan.annualPrice : plan.monthlyPrice;

            return (
              <div
                key={index}
                className={`relative border ${
                  popular ? "border-[#B8FF66]" : "border-white/[0.08]"
                } rounded-[16px] bg-white/[0.03] py-[32px] px-[28px] ${
                  popular ? "xl:-mt-[16px] xl:pb-[48px]" : ""
                }`}
              >
                {popular && (
                  <span className="absolute -top-[12px] left-1/2 -translate-x-1/2 bg-[#B8FF66] text-[#0A0A0B] text-[10px] font-bold uppercase tracking-[0.15em] rounded-full px-[16px] py-[6px]">
                    Most popular
                  </span>
                )}

                {/* Plan name */}
                <span
                  className={`block mb-[8px] uppercase font-bold tracking-[0.15em] text-[11px] ${
                    popular ? "text-[#B8FF66]" : "text-white/50"
                  }`}
                >
                  {plan.title}
                </span>

                {/* Tagline */}
                <p className="!mb-[16px] text-[13px] text-[#B8FF66]/80 font-medium">
                  {plan.tagline}
                </p>

                {/* Trial badge */}
                <span className="inline-block mb-[20px] rounded-full border border-[#B8FF66]/40 text-[#B8FF66] text-[10px] font-bold uppercase tracking-[0.15em] px-[14px] py-[5px]">
                  7 days free
                </span>

                {/* Description */}
                <p className="text-white/50 text-[15px] leading-[1.6]">
                  {plan.description}
                </p>

                {/* Price */}
                <div className="mt-[24px] mb-[8px] block leading-none text-white text-[48px] md:text-[56px] font-light -tracking-[2px]">
                  {price}{" "}
                  <span className="text-[15px] tracking-[0.05em] font-normal text-white/40">
                    / mo
                  </span>
                </div>

                {annual && (
                  <p className="text-[#B8FF66]/70 text-[12px] font-medium">
                    ${annual
                      ? plan.title === "Founder"
                        ? "390"
                        : plan.title === "Team"
                        ? "948"
                        : "2388"
                      : ""}/year billed annually
                  </p>
                )}

                <p className="text-white/40 text-[13px]">
                  Card required. Cancel any time.
                </p>

                {/* Features */}
                <ul className="my-[32px] space-y-[12px]">
                  {plan.features.map((feature, featureIndex) => (
                    <li
                      key={featureIndex}
                      className="relative pl-[28px] text-white text-[15px]"
                    >
                      <i className="ri-check-double-line absolute top-1/2 -translate-y-1/2 left-0 text-[#B8FF66] text-[18px]"></i>
                      {feature.text}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <Link
                  href={plan.cta.href}
                  className={`btn-press block w-full rounded-full ${
                    popular
                      ? "bg-[#B8FF66] text-[#0A0A0B] hover:bg-[#A3E855]"
                      : "bg-white/[0.06] text-white hover:bg-[#B8FF66] hover:text-[#0A0A0B]"
                  } p-[12px] uppercase text-[11px] font-bold tracking-[0.15em] transition-colors`}
                >
                  <span className="flex items-center justify-center gap-[12px]">
                    {plan.cta.label}{" "}
                    <i className="ri-arrow-right-up-line w-[28px] h-[28px] rounded-full bg-current/10 text-current flex items-center justify-center text-sm"></i>
                  </span>
                </Link>
              </div>
            );
          })}
        </div>

        {/* Enterprise */}
        <div className="mt-[24px] border border-white/[0.08] rounded-[16px] bg-white/[0.03] px-[28px] md:px-[36px] py-[28px] md:py-[36px]">
          <div className="flex flex-col lg:flex-row lg:items-center gap-[28px] md:gap-[36px] lg:gap-[50px]">
            <div className="lg:max-w-[300px] lg:flex-shrink-0">
              <span className="block mb-[12px] uppercase font-bold tracking-[0.15em] text-[11px] text-white/50">
                Enterprise
              </span>
              <h3 className="!mb-0 !font-normal !text-[24px] md:!text-[28px] -tracking-[0.5px] !text-white">
                Custom AI organizations for larger teams.
              </h3>
              <p className="!mb-0 mt-[12px] text-white/50 text-[15px]">
                Bespoke governance, dedicated infrastructure, and a team that
                gets you running.
              </p>
            </div>
            <ul className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-[28px] gap-y-[14px]">
              {enterpriseFeatures.map((feature, featureIndex) => (
                <li
                  key={featureIndex}
                  className="relative pl-[28px] text-white text-[15px]"
                >
                  <i className="ri-check-double-line absolute top-1/2 -translate-y-1/2 left-0 text-[#B8FF66] text-[18px]"></i>
                  {feature}
                </li>
              ))}
            </ul>
            <div className="lg:flex-shrink-0">
              <Link
                href="/contact"
                className="btn-press block w-full lg:w-auto rounded-full bg-white/[0.06] hover:bg-[#B8FF66] hover:text-[#0A0A0B] p-[12px] lg:px-[28px] uppercase text-[11px] font-bold text-white tracking-[0.15em] transition-colors"
              >
                <span className="flex items-center justify-center gap-[12px]">
                  Contact us{" "}
                  <i className="ri-arrow-right-up-line w-[28px] h-[28px] rounded-full bg-current/10 text-current flex items-center justify-center text-sm"></i>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Pricing;
