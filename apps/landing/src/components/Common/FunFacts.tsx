"use client";

import React from "react";

interface FunFactItem {
  id: number;
  icon: string;
  value: string;
  description: string;
}

const FunFacts: React.FC = () => {
  const funFacts: FunFactItem[] = [
    {
      id: 1,
      icon: "ri-user-3-line",
      value: "03",
      description: "Agents working from your first day",
    },
    {
      id: 2,
      icon: "ri-shield-check-line",
      value: "100%",
      description: "Decisions stay with you, the CEO",
    },
    {
      id: 3,
      icon: "ri-calendar-check-line",
      value: "7",
      description: "Days free on every plan. Card required, cancel any time",
    },
    {
      id: 4,
      icon: "ri-time-line",
      value: "24/7",
      description: "Your company keeps working while you sleep",
    },
  ];

  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[25px]">
            {funFacts.map((fact) => (
              <div
                key={fact.id}
                className="lift-card text-center rounded-[15px] md:rounded-[20px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/10 shadow-sm px-[20px] py-[30px] md:py-[40px]"
              >
                <span className="w-[54px] h-[54px] md:w-[60px] md:h-[60px] rounded-full bg-lime/15 text-lime flex items-center justify-center text-[24px] md:text-[28px] leading-none mx-auto mb-[18px] md:mb-[22px]">
                  <i className={fact.icon}></i>
                </span>
                <h3 className="!font-light !text-[38px] md:!text-[46px] lg:!text-[54px] leading-none -tracking-[2.8px] md:-tracking-[3.8px] !mb-[10px] lg:!mb-[14px]">
                  <span className="text-primary-500">{fact.value}</span>
                </h3>
                <span className="block text-sm md:text-[15px] text-gray-500 dark:text-gray-400 -tracking-[0.16px] leading-[1.6]">
                  {fact.description}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default FunFacts;
