"use client";

import React from "react";

const cards = [
  {
    icon: "ri-slack-fill",
    iconBg: "#ECF5EC",
    iconColor: "#611f69",
    title: "Slack",
    text: "Give ORQ8 a brief in one message. It plans, hires, and reports right where you work.",
  },
  {
    icon: "ri-github-fill",
    iconBg: "#EDEDF6",
    iconColor: "#24292f",
    title: "GitHub",
    text: "Agents open PRs, review code, and ship. Every deploy routes through your approval.",
  },
  {
    icon: "ri-google-fill",
    iconBg: "#F9EAE0",
    iconColor: "#4285F4",
    title: "Gmail & Drive",
    text: "Draft, send, and file. Your company email and documents stay inside the org.",
  },
  {
    icon: "ri-notion-line",
    iconBg: "#F9EAE0",
    iconColor: "#000000",
    title: "Notion",
    text: "Company memory lives where you read it: docs, wikis, and decisions in sync.",
  },
  {
    icon: "ri-stripe-line",
    iconBg: "#ECF5EC",
    iconColor: "#635bff",
    title: "Stripe",
    text: "Spend is tracked against budgets in real time. Every dollar accounted for.",
  },
  {
    icon: "ri-zapier-line",
    iconBg: "#EDEDF6",
    iconColor: "#FF4F00",
    title: "Zapier",
    text: "Connect the rest of your stack. Automations flow through the same audit trail.",
  },
];

const Integrations: React.FC = () => {
  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center lg:max-w-[781px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-[11px] md:text-xs text-primary-500 mb-[8px] md:mb-[10px] lg:mb-[12px]">
              INTEGRATIONS
            </span>
            <h2 className="!mb-0 !text-[26px] md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[1.5px] lg:-tracking-[2.3px]">
              One organization,{" "}
              <span className="text-primary-500">connected to your stack</span>
            </h2>
            <p className="max-w-[520px] mx-auto mt-[12px] md:mt-[16px] text-gray-500 dark:text-gray-400">
              The tools you already use plug straight in. Same approvals, same
              budgets, same audit trail across all of them.
            </p>
          </div>

          {/* Even 3-column grid: cards, core, cards. No negative margins, no
              overlap — every container keeps its own space. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[25px] items-center">
            <div className="space-y-[25px] lg:space-y-[40px]">
              {cards.slice(0, 3).map((card) => (
                <IntegrationCard key={card.title} card={card} />
              ))}
            </div>

            <div className="relative hidden lg:flex items-center justify-center">
              {/* soft glow behind the core */}
              <div className="absolute w-[440px] h-[440px] rounded-full bg-lime blur-[100px] opacity-[0.10]"></div>

              {/* outer rings with orbiting satellites */}
              <div className="absolute w-[400px] h-[400px]">
                <div className="animate-orbit-slower absolute inset-0 rounded-full border border-dashed border-[#E5E5E5] dark:border-white/15">
                  <span className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full bg-primary-500/70"></span>
                  <span className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full bg-primary-500/70"></span>
                </div>
              </div>
              <div className="absolute w-[296px] h-[296px]">
                <div className="animate-orbit-slow absolute inset-0 rounded-full border border-dashed border-[#E5E5E5] dark:border-white/15">
                  <span className="absolute top-1/2 -translate-y-1/2 -right-[5px] w-[10px] h-[10px] rounded-full bg-lime animate-pulse-dot"></span>
                  <span className="absolute top-1/2 -translate-y-1/2 -left-[5px] w-[10px] h-[10px] rounded-full bg-lime animate-pulse-dot"></span>
                </div>
              </div>

              {/* the core */}
              <div className="relative bg-navy-950 dark:bg-navy-950 mx-auto w-[196px] h-[196px] rounded-full flex flex-col items-center justify-center border border-white/10 dark:border-white/20 shadow-[0_20px_60px_-15px_rgba(13,20,39,0.55)] dark:shadow-[0_0_70px_-15px_rgba(200,255,50,0.25)]">
                <span className="text-white text-[32px] font-bold tracking-[-1.6px] leading-none">
                  ORQ8
                </span>
                <span className="mt-[10px] flex items-center gap-[7px]">
                  <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
                  <span className="text-[9px] font-semibold uppercase tracking-[2.4px] text-white/60">
                    System online
                  </span>
                </span>
              </div>
            </div>

            <div className="space-y-[25px] lg:space-y-[40px]">
              {cards.slice(3).map((card) => (
                <IntegrationCard key={card.title} card={card} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

const IntegrationCard: React.FC<{
  card: (typeof cards)[number];
}> = ({ card }) => {
  return (
    <div className="lift-card group relative px-[20px] md:px-[25px] py-[25px] md:py-[30px] rounded-[10px] md:rounded-[20px] flex items-center gap-[15px] md:gap-[20px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/15 shadow-sm dark:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.6)]">
      <div
        className="w-[64px] h-[64px] md:w-[72px] md:h-[72px] rounded-[10px] md:rounded-[20px] flex items-center justify-center flex-none transition-transform duration-300 group-hover:scale-105"
        style={{ backgroundColor: card.iconBg }}
      >
        <i
          className={`${card.icon} text-[32px] md:text-[36px] leading-none`}
          style={{ color: card.iconColor }}
        ></i>
      </div>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-[8px]">
          <h3 className="!font-semibold -tracking-[0.2px] !text-lg md:!text-[20px] !mb-0">
            {card.title}
          </h3>
          <span className="flex-none flex items-center gap-[6px] text-[10px] font-semibold uppercase tracking-[1.4px] text-gray-400 dark:text-gray-400">
            <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
            Live
          </span>
        </div>
        <p className="lg:-tracking-[0.16px] lg:text-[15px] xl:text-md text-gray-500 dark:text-gray-400 mt-[8px] !mb-0">
          {card.text}
        </p>
      </div>
    </div>
  );
};

export default Integrations;
