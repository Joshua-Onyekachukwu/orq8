"use client";

import React from "react";
import Link from "next/link";

interface PricingPlan {
  title: string;
  description: string;
  price: string;
  features: string[];
}

const Pricing: React.FC = () => {
  const pricingPlans: PricingPlan[] = [
    {
      title: "Free",
      description:
        "Everything you need to see ORQ8 run a real company — your first agents, working.",
      price: "$0",
      features: [
        "Your first 3 agents",
        "1 department",
        "Approvals + audit trail",
        "Weekly report",
        "Community support",
      ],
    },
    {
      title: "Pro",
      description:
        "For founders building a full organization that runs while they sleep.",
      price: "$49",
      features: [
        "Unlimited agents",
        "All departments + teams",
        "Budgets + company Constitution",
        "BYOK — bring your own keys",
        "Priority support",
      ],
    },
    {
      title: "Business",
      description:
        "For companies that need real scale, governance, and admin control.",
      price: "$199",
      features: [
        "Everything in Pro",
        "Multiple organizations",
        "Custom governance rules",
        "SSO + admin controls",
        "Dedicated support",
      ],
    },
  ];

  const styles: Record<string, { border: string; text: string; button: string; buttonHover: string; buttonText: string }> = {
    Free: {
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
              Free to join. <span className="text-lime">$49 when it earns its keep.</span>
            </h2>
          </div>

          <div className="md:max-w-[1076px] mx-auto relative top-[140px] -mt-[140px]">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[25px]">
              {pricingPlans.map((plan, index) => {
                const s = styles[plan.title];
                const popular = plan.title === "Pro";

                return (
                  <div
                    key={index}
                    className={`lift-card relative border-[2px] md:border-[5px] lg:border-[10px] ${s.border} rounded-[15px] md:rounded-[30px] bg-navy-800 py-[25px] md:py-[35px] lg:py-[45px] px-[18px] md:px-[25px] lg:px-[35px] ${
                      popular ? "lg:-mt-[30px] lg:pb-[60px]" : ""
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
                    <p className="text-[#8f8f99] -tracking-[0.16px] md:text-[15px] lg:text-md">
                      {plan.description}
                    </p>
                    <div className="mt-[20px] md:mt-[30px] mb-[6px] block leading-none text-white text-[40px] md:text-[45px] lg:text-[55px] font-light -tracking-[2.5px] md:-tracking-[3.6px]">
                      {plan.price}{" "}
                      <span className="text-base md:text-[15px] tracking-[.5px] md:tracking-[1.5px] font-normal text-[#8F8F99] ltr:-ml-[4px] rtl:-mr-[4px]">
                        {plan.title === "Free" ? "" : "/ MO"}
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
                      href="/#waitlist"
                      className={`btn-press block w-full rounded-[60px] ${s.button} p-[7px] md:p-[10px] uppercase text-xs font-bold ${s.buttonText} tracking-[1.8px] ${s.buttonHover}`}
                    >
                      <span className="flex items-center justify-center gap-[15px] md:gap-[20px]">
                        Join the waitlist{" "}
                        <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                      </span>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Pricing;
