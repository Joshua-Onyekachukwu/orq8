"use client";

import React from "react";

interface FunFactItem {
  id: number;
  value: string;
  description: string;
}

const FunFacts: React.FC = () => {
  const funFacts: FunFactItem[] = [
    {
      id: 1,
      value: "03",
      description: "Agents working from your first day",
    },
    {
      id: 2,
      value: "100%",
      description: "Decisions stay with you, the CEO",
    },
    {
      id: 3,
      value: "7",
      description: "Days free on every plan. Card required, cancel any time",
    },
    {
      id: 4,
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
                className="text-center ltr:sm:text-left rtl:sm:text-right"
              >
                <h3 className="!font-light !text-[40px] md:!text-[60px] lg:!text-[80px] leading-none -tracking-[2.8px] md:-tracking-[3.8px] lg:-tracking-[4.8px] !mb-[5px] lg:!mb-[10px]">
                  <span className="text-primary-500">{fact.value}</span>
                </h3>
                <span className="block uppercase tracking-[1.4px] leading-[1.6] md:leading-[1.7] lg:leading-[1.8]">
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
