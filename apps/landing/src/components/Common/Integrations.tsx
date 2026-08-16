"use client";

import React from "react";

const Integrations: React.FC = () => {
  const groups = [
    {
      side: "left" as const,
      cards: [
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
      ],
    },
    {
      side: "right" as const,
      cards: [
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
      ],
    },
  ];

  return (
    <>
      <div className="py-[60px] md:py-[80px] lg:py-[100px] xl:py-[120px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center lg:max-w-[781px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-[11px] md:text-xs text-primary-500 mb-[8px] md:mb-[10px] lg:mb-[12px]">
              INTEGRATIONS
            </span>
            <h2 className="!mb-0 !text-[26px] md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[1.5px] lg:-tracking-[2.3px]">
              One organization,{" "}
              <span className="text-primary-500">connected to your stack</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-[25px] items-center">
            {groups.map((group) => (
              <div
                key={group.side}
                className={`relative z-[1] ${
                  group.side === "left"
                    ? "ltr:lg:-mr-[95px] rtl:lg:-ml-[95px]"
                    : "ltr:lg:-ml-[95px] rtl:lg:-mr-[95px]"
                }`}
              >
                {group.cards.map((card, i) => (
                  <div
                    key={card.title}
                    className={`lift-card px-[20px] md:px-[25px] py-[25px] md:py-[35px] mb-[25px] lg:mb-[40px] last:mb-0 rounded-[10px] md:rounded-[20px] flex items-center gap-[15px] md:gap-[20px] ${
                      i === 0
                        ? "md:mx-[50px] lg:mx-0 xl:mx-[50px]"
                        : i === 1
                          ? group.side === "left"
                            ? "ltr:md:mr-[100px] rtl:md:ml-[100px] ltr:lg:mr-[45px] rtl:lg:ml-[45px] ltr:xl:mr-[100px] rtl:xl:ml-[100px]"
                            : "ltr:md:ml-[100px] rtl:md:mr-[100px] ltr:lg:ml-[45px] rtl:lg:mr-[45px] ltr:xl:ml-[100px] rtl:xl:mr-[100px]"
                          : group.side === "left"
                            ? "ltr:md:ml-[100px] rtl:md:mr-[100px] ltr:lg:ml-[30px] rtl:lg:mr-[30px] ltr:xl:ml-[100px] rtl:xl:mr-[100px]"
                            : "ltr:md:mr-[100px] rtl:md:ml-[100px] ltr:lg:mr-[30px] rtl:lg:ml-[30px] ltr:xl:mr-[100px] rtl:xl:ml-[100px]"
                    }`}
                    style={{ backgroundColor: card.iconBg }}
                  >
                    <div className="w-[72px] h-[72px] rounded-[10px] md:rounded-[20px] bg-white flex items-center justify-center flex-none shadow-sm">
                      <i
                        className={`${card.icon} text-[36px] leading-none`}
                        style={{ color: card.iconColor }}
                      ></i>
                    </div>
                    <div>
                      <h3 className="!font-semibold -tracking-[0.2px] !text-lg md:!text-[20px] !mb-[10px]">
                        {card.title}
                      </h3>
                      <p className="lg:-tracking-[0.16px] lg:text-[15px] xl:text-md text-gray-500 dark:text-gray-400">
                        {card.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))}

            <div className="relative hidden lg:block">
              <div className="bg-navy-950 dark:bg-black mx-auto w-[186px] h-[186px] rounded-full flex items-center justify-center">
                <span className="text-white text-[28px] font-bold tracking-[-1.4px]">
                  ORQ8
                </span>
              </div>
              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[240px] h-[240px] rounded-full border border-[#E5E5E5] border-dashed dark:border-gray-900"></div>
              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[384px] h-[384px] rounded-full border border-[#E5E5E5] border-dashed dark:border-gray-900"></div>
              <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-[528px] h-[528px] rounded-full border border-[#E5E5E5] border-dashed dark:border-gray-900"></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Integrations;
