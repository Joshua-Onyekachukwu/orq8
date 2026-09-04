"use client";

import React from "react";

const features = [
  {
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    title: "AI Employees",
    description: "Build a team of specialized AI employees with defined roles, budgets, and authority.",
  },
  {
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Command Center",
    description: "Live state of your organization. Active agents, tasks, costs — executive visibility.",
  },
  {
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Approval Gates",
    description: "AI proposes. You decide. Consequential actions route to you.",
  },
  {
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    title: "Goals & Tasks",
    description: "Set the direction in plain language. The system breaks them into tasks and tracks progress.",
  },
  {
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    title: "Company Memory",
    description: "Every decision, lesson, and outcome accumulates. Your company gets smarter.",
  },
  {
    icon: (
      <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: "Audit Trail",
    description: "Every action, every dollar, tracked. Time-stamped and immutable.",
  },
];

const Features: React.FC = () => {
  return (
    <div id="features" className="relative z-[1] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        {/* Header */}
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-emerald mb-[10px] lg:mb-[15px]">
            Platform
          </span>
          <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            An operating system, not a chatbot
          </h2>
        </div>

        {/* Feature grid — Trezo Finance style: icon circle on left, text on right */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-[25px]">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group relative z-[1] py-[25px] md:py-[30px] lg:py-[40px] px-[20px] ltr:md:pr-[25px] rtl:md:pl-[25px] ltr:lg:pr-[30px] rtl:lg:pl-[30px] ltr:md:pl-[95px] rtl:md:pr-[95px] ltr:lg:pl-[105px] rtl:lg:pr-[105px]"
            >
              {/* Card background — Trezo style */}
              <div className="rounded-[10px] md:rounded-[20px] absolute top-0 bottom-0 left-0 right-0 bg-white dark:bg-[#0a0e19] -z-[1] ltr:md:ml-[42px] rtl:md:mr-[42px] border border-hairline dark:border-white/[0.04]"></div>

              {/* Icon circle — Trezo style */}
              <div
                className="w-[70px] h-[70px] md:w-[75px] md:h-[75px] lg:w-[84px] lg:h-[84px] flex items-center justify-center rounded-full bg-canvas dark:bg-dark text-emerald md:absolute md:top-1/2 md:-translate-y-1/2 ltr:md:left-0 rtl:md:right-0 transition-all group-hover:bg-emerald group-hover:text-white mb-[17px] md:mb-0"
                style={{ filter: "drop-shadow(0px 4px 16px rgba(16, 185, 129, 0.07))" }}
              >
                {feature.icon}
              </div>

              <h3 className="!font-light !text-[20px] md:!text-[22px] -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.22px] !mb-[10px] md:!mb-[12px]">
                {feature.title}
              </h3>
              <p className="md:text-[15px] lg:text-md -tracking-[0.16px] text-ink-muted dark:text-white/60">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Subtle background blurs — Trezo style */}
      <div className="bg-emerald/10 blur-[302px] opacity-[0.3] rounded-[672px] w-[320px] md:w-[672px] h-[527px] absolute -z-[1] ltr:left-0 rtl:right-0 ltr:md:left-[10%] rtl:md:right-[10%] ltr:lg:left-[20%] rtl:lg:right-[20%] bottom-[50%] md:bottom-[10%]"></div>
      <div className="bg-emerald/5 blur-[362px] opacity-[0.3] rounded-[556px] w-[320px] md:w-[556px] h-[466px] absolute -z-[1] ltr:right-0 rtl:left-0 ltr:md:right-[20%] rtl:md:left-[20%] bottom-[10%]"></div>
    </div>
  );
};

export default Features;
