"use client";

import React from "react";

interface FunFactItem {
  id: number;
  value: string;
  label: string;
  description: string;
}

const funFacts: FunFactItem[] = [
  {
    id: 1,
    value: "03",
    label: "AI Employees",
    description: "Working from your first day",
  },
  {
    id: 2,
    value: "100%",
    label: "Decisions",
    description: "Stay with you, the CEO",
  },
  {
    id: 3,
    value: "7",
    label: "Days free",
    description: "On every plan. Cancel any time",
  },
  {
    id: 4,
    value: "24/7",
    label: "Always on",
    description: "Your company works while you sleep",
  },
];

const FunFacts: React.FC = () => {
  return (
    <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] bg-navy-950 relative overflow-hidden">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[20px] md:gap-[30px]">
          {funFacts.map((fact) => (
            <div
              key={fact.id}
              className="text-center rounded-[16px] border border-white/10 bg-white/[0.04] p-[24px] md:p-[30px]"
            >
              <h3 className="!font-bold !text-[36px] md:!text-[42px] leading-none !mb-[8px] !text-white">
                {fact.value}
              </h3>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-lime mb-[8px]">
                {fact.label}
              </span>
              <p className="!text-white/50 !text-[13px] !leading-[1.5] !m-0">
                {fact.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Background glow */}
      <div className="absolute -z-[1] pointer-events-none">
        <div className="bg-blue-500 blur-[300px] opacity-[0.06] rounded-full w-[500px] h-[400px] absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
    </div>
  );
};

export default FunFacts;
