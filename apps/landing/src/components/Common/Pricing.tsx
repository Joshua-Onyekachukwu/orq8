"use client";

import React from "react";
import Link from "next/link";

interface PricingPlan {
  title: string;
  description: string;
  price: string;
  priceNote: string;
  features: string[];
  cta: { label: string; href: string };
  popular?: boolean;
}

const Pricing: React.FC = () => {
  const pricingPlans: PricingPlan[] = [
    {
      title: "Starter",
      description:
        "The first step. Your first agents working for you within a week.",
      price: "$0",
      priceNote: "for 7 days",
      features: [
        "Your first 3 agents",
        "1 department",
        "Approvals + audit trail",
        "Weekly report",
        "Community support",
      ],
      cta: { label: "Start free", href: "/#waitlist" },
    },
    {
      title: "Pro",
      description:
        "For founders building a full organization that runs while they sleep.",
      price: "$49",
      priceNote: "/ MO",
      features: [
        "Unlimited agents",
        "All departments + teams",
        "Budgets + company Constitution",
        "BYOK: bring your own keys",
        "Priority support",
      ],
      cta: { label: "Join the waitlist", href: "/#waitlist" },
      popular: true,
    },
    {
      title: "Business",
      description:
        "For companies that need real scale, governance, and admin control.",
      price: "$199",
      priceNote: "/ MO",
      features: [
        "Everything in Pro",
        "Multiple organizations",
        "Custom governance rules",
        "SSO + admin controls",
        "Dedicated support",
      ],
      cta: { label: "Join the waitlist", href: "/#waitlist" },
    },
  ];

  const enterpriseFeatures: string[] = [
    "Everything in Business",
    "Custom AI model contracts",
    "Dedicated infrastructure",
    "Security review + SLA",
    "Onboarding + success team",
    "Dedicated account manager",
  ];

  const styles: Record<string, { border: string; text: string; button: string; buttonHover: string; buttonText: string }> = {
    Starter: {
      border: "border-white/20",
      text: "text-white/60",
      button: "bg-white/10",
      buttonHover: "hover:bg-primary-500 hover:text-white",
      buttonText: "text-white",
    },
    Pro: {
      border: "border-lime",
      text: "text-lime",
      button: "bg-lime",
      buttonHover: "hover:bg-primary-500 hover:text-white",
      buttonText: "text-black",
    },
    Business: {
      border: "border-primary-500",
      text: "text-primary-500",
      button: "bg-primary-500",
      buttonHover: "hover:bg-lime hover:text-black",
      buttonText: "text-white",
    },
  };

  return (
    <>
      <div
        className="relative z-[2] bg-center bg-cover bg-no-repeat pt-[70px] md:pt-[90px] lg:pt-[110px] xl:pt-[130px] 2xl:pt-[150px]"
        style={{ backgroundImage: "url(/images/pricing-bg.jpg)" }}
      >
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
              Pricing
            </span>
            <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px] !text-white">
              Every plan starts with{" "}
              <span className="text-lime">7 days free.</span>
            </h2>
            <p className="!mb-0 mt-[12px] md:mt-[16px] text-white/60 md:text-[15px] lg:text-md">
              Card on file, nothing charged until day 8. Cancel any time.
            </p>
          </div>

          <div className="md:max-w-[1316px] mx-auto relative top-[140px] -mt-[140px]">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[25px]">
              {pricingPlans.map((plan, index) => {
                const s = styles[plan.title];
                const popular = Boolean(plan.popular);

                return (
                  <div
                    key={index}
                    className={`lift-card relative border-[2px] md:border-[5px] lg:border-[10px] ${s.border} rounded-[15px] md:rounded-[30px] bg-navy-800 py-[25px] md:py-[35px] lg:py-[45px] px-[18px] md:px-[25px] lg:px-[30px] ${
                      popular ? "xl:-mt-[30px] xl:pb-[60px]" : ""
                    }`}
                  >
                    {popular && (
                      <span className="absolute -top-[14px] left-1/2 -translate-x-1/2 bg-lime text-black text-[10px] font-bold uppercase tracking-[1.8px] rounded-[50px] px-[14px] py-[6px]">
                        Most popular
                      </span>
                    )}
                    <span
                      className={`block mb-[10px] md:mb-[15px] lg:mb-[25px] uppercase font-bold tracking-[1.8px] text-xs ${s.text}`}
                    >
                      {plan.title}
                    </span>
                    <span className="inline-block mb-[12px] md:mb-[18px] rounded-[50px] border border-lime/40 text-lime text-[9px] font-bold uppercase tracking-[1.8px] px-[12px] py-[5px]">
                      7 days free
                    </span>
                    <p className="text-[#8f8f99] -tracking-[0.16px] md:text-[15px] lg:text-md">
                      {plan.description}
                    </p>
                    <div className="mt-[20px] md:mt-[30px] mb-[6px] block leading-none text-white text-[40px] md:text-[45px] lg:text-[55px] font-light -tracking-[2.5px] md:-tracking-[3.6px]">
                      {plan.price}{" "}
                      <span className="text-base md:text-[15px] tracking-[.5px] md:tracking-[1.5px] font-normal text-[#8F8F99] ltr:-ml-[4px] rtl:-mr-[4px]">
                        {plan.priceNote}
                      </span>
                    </div>
                    <p className="text-[#8f8f99] -tracking-[0.14px]">
                      Pause or cancel any time. No surprises.
                    </p>
                    <ul className="my-[30px] lg:my-[35px]">
                      {plan.features.map((feature, featureIndex) => (
                        <li
                          key={featureIndex}
                          className="mb-[13px] relative ltr:pl-[30px] rtl:pr-[30px] ltr:md:pl-[35px] rtl:md:pr-[35px] text-white -tracking-[0.16px] md:text-[15px] lg:text-md"
                        >
                          <i className="ri-check-double-line absolute top-1/2 -translate-y-1/2 ltr:-left-[2px] rtl:-right-[2px] text-lime text-[22px] md:text-[24px]"></i>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link
                      href={plan.cta.href}
                      className={`btn-press block w-full rounded-[60px] ${s.button} p-[7px] md:p-[10px] uppercase text-xs font-bold ${s.buttonText} tracking-[1.8px] ${s.buttonHover}`}
                    >
                      <span className="flex items-center justify-center gap-[15px] md:gap-[20px]">
                        {plan.cta.label}{" "}
                        <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>

            <div className="mt-[25px] lift-card border-[2px] md:border-[5px] lg:border-[10px] border-white/20 rounded-[15px] md:rounded-[30px] bg-navy-800 px-[18px] md:px-[30px] lg:px-[45px] py-[25px] md:py-[35px] lg:py-[40px]">
              <div className="flex flex-col lg:flex-row lg:items-center gap-[25px] md:gap-[35px] lg:gap-[50px]">
                <div className="lg:max-w-[280px] lg:flex-shrink-0">
                  <span className="block mb-[10px] md:mb-[15px] uppercase font-bold tracking-[1.8px] text-xs text-white/60">
                    Enterprise
                  </span>
                  <span className="inline-block mb-[12px] md:mb-[18px] rounded-[50px] border border-lime/40 text-lime text-[9px] font-bold uppercase tracking-[1.8px] px-[12px] py-[5px]">
                    7 days free
                  </span>
                  <h3 className="!mb-0 !font-light !text-xl md:!text-2xl lg:!text-[28px] -tracking-[1px] md:-tracking-[1.6px] !text-white">
                    Custom AI organizations for larger teams.
                  </h3>
                  <p className="!mb-0 mt-[10px] md:mt-[14px] text-[#8f8f99] md:text-[15px] lg:text-md">
                    Bespoke governance, dedicated infrastructure, and a team that
                    gets you running.
                  </p>
                </div>
                <ul className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-[25px] gap-y-[12px] md:gap-y-[14px]">
                  {enterpriseFeatures.map((feature, featureIndex) => (
                    <li
                      key={featureIndex}
                      className="relative ltr:pl-[28px] rtl:pr-[28px] text-white -tracking-[0.16px] md:text-[15px] lg:text-md"
                    >
                      <i className="ri-check-double-line absolute top-1/2 -translate-y-1/2 ltr:-left-[2px] rtl:-right-[2px] text-lime text-[22px] md:text-[24px]"></i>
                      {feature}
                    </li>
                  ))}
                </ul>
                <div className="lg:flex-shrink-0">
                  <Link
                    href="/contact/"
                    className={`btn-press block w-full lg:w-auto rounded-[60px] bg-white/10 hover:bg-lime hover:text-black p-[7px] md:p-[10px] lg:px-[26px] uppercase text-xs font-bold text-white tracking-[1.8px]`}
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
