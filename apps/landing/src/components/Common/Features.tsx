"use client";

import React from "react";

interface FeatureItem {
  id: number;
  icon: string;
  title: string;
  description: string;
}

const Features: React.FC = () => {
  const features: FeatureItem[] = [
    {
      id: 1,
      icon: "ri-verified-badge-fill",
      title: "Approval gates",
      description:
        "Consequential actions route to you — a spend, a publish, a deploy. Approve or reject in one tap. Everything else runs.",
    },
    {
      id: 2,
      icon: "ri-key-2-fill",
      title: "Encrypted keys",
      description:
        "Provider credentials encrypted at rest, masked in the UI, and rotatable without downtime.",
    },
    {
      id: 3,
      icon: "ri-file-text-fill",
      title: "Audit trail",
      description:
        "Every decision, action, and cost — time-stamped and immutable. Your company has a memory you can trust.",
    },
    {
      id: 4,
      icon: "ri-brain-fill",
      title: "Company memory",
      description:
        "Decisions and lessons accumulate from day one. Your organization gets smarter the longer it works with you.",
    },
    {
      id: 5,
      icon: "ri-pie-chart-2-fill",
      title: "Cost-aware routing",
      description:
        "Every task knows its budget. Costs tracked per department and per agent — no surprises on the invoice.",
    },
    {
      id: 6,
      icon: "ri-calendar-check-fill",
      title: "Weekly report",
      description:
        "Every Monday: what happened, what's blocked, what it cost, what's next. Five minutes to read.",
    },
  ];

  return (
    <>
      <div
        id="features"
        className="relative z-[1] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] scroll-mt-[100px]"
      >
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
              Features
            </span>
            <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
              An operating system,{" "}
              <span className="text-primary-500">not a chatbot</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[25px]">
            {features.map((feature) => (
              <div
                key={feature.id}
                className="group relative z-[1] py-[25px] md:py-[30px] lg:py-[40px] px-[20px] ltr:md:pr-[25px] rtl:md:pl-[25px] ltr:lg:pr-[30px] rtl:lg:pl-[30px] ltr:md:pl-[95px] rtl:md:pr-[95px] ltr:lg:pl-[105px] rtl:lg:pr-[105px]"
              >
                <div className="rounded-[10px] md:rounded-[20px] absolute top-0 bottom-0 left-0 right-0 bg-white dark:bg-navy-900 -z-[1] ltr:md:ml-[42px] rtl:md:mr-[42px]"></div>
                <div
                  className="w-[70px] h-[70px] md:w-[75px] md:h-[75px] lg:w-[84px] lg:h-[84px] flex items-center justify-center rounded-full bg-[#eef] dark:bg-dark md:absolute md:top-1/2 md:-translate-y-1/2 ltr:md:left-0 rtl:md:right-0 transition-colors group-hover:bg-primary-500 mb-[17px] md:mb-0"
                  style={{
                    filter: "drop-shadow(0px 4px 16px rgba(96, 93, 255, 0.07))",
                  }}
                >
                  <i className={`${feature.icon} text-[34px] md:text-[38px] leading-none text-primary-500 group-hover:text-white transition-colors`}></i>
                </div>
                <h3 className="!font-light !text-[20px] md:!text-[22px] -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.22px] !mb-[10px] md:!mb-[12px]">
                  {feature.title}
                </h3>
                <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-lime blur-[302px] opacity-[0.6] rounded-[672px] w-[320px] md:w-[672px] h-[527px] absolute -z-[1] ltr:left-0 rtl:right-0 ltr:md:left-[10%] rtl:md:right-[10%] ltr:lg:left-[20%] rtl:lg:right-[20%] bottom-[50%] md:bottom-[10%]"></div>
        <div className="bg-primary-500 blur-[362px] opacity-[0.6] rounded-[556px] w-[320px] md:w-[556px] h-[466px] absolute -z-[1] ltr:right-0 rtl:left-0 ltr:md:right-[20%] rtl:md:left-[20%] bottom-[10%]"></div>
      </div>
    </>
  );
};

export default Features;
