import React from "react";
import Link from "next/link";

const steps = [
  {
    id: 1,
    number: "01",
    title: "You give direction",
    description:
      "Tell ORQ8 your goal in plain words. One sentence or a full brief — that's the whole input.",
    bgColor: "bg-[#e8faf0]",
    accentColor: "text-[#1a5c2e]",
    numberBg: "bg-[#1a5c2e]",
    numberText: "text-white",
  },
  {
    id: 2,
    number: "02",
    title: "Your company executes",
    description:
      "The Executive Agent plans the work, hires the right specialists, and coordinates them across your tools. Big actions come back for approval.",
    bgColor: "bg-[#fff3e8]",
    accentColor: "text-[#E86A33]",
    numberBg: "bg-[#E86A33]",
    numberText: "text-white",
  },
  {
    id: 3,
    number: "03",
    title: "You see the outcome",
    description:
      "Approve in one tap. Every Monday, a report on what happened, what it cost, and what's next.",
    bgColor: "bg-[#f0fde5]",
    accentColor: "text-[#1a5c2e]",
    numberBg: "bg-[#B8FF66]",
    numberText: "text-[#1a5c2e]",
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="relative z-[1] bg-white py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] overflow-hidden"
    >
      <div className="relative container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        {/* Section header — Trezo style */}
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-[#E86A33] mb-[10px] lg:mb-[15px]">
            How it works
          </span>
          <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            You give direction.{" "}
            <span className="text-[#1a5c2e]">Your Company of One does the rest.</span>
          </h2>
        </div>

        {/* 3 step cards — Trezo Services pattern */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[25px]">
          {steps.map((step) => (
            <div
              key={step.id}
              className={`group rounded-[10px] md:rounded-[20px] ${step.bgColor} p-[20px] transition-all duration-300`}
            >
              <div className="pt-[5px] md:pt-[10px] lg:pt-[20px] md:px-[10px] xl:px-[15px]">
                {/* Step number badge */}
                <div className={`inline-flex items-center justify-center w-[48px] h-[48px] rounded-full ${step.numberBg} ${step.numberText} text-[14px] font-bold tracking-wide mb-[20px] md:mb-[25px]`}>
                  {step.number}
                </div>

                <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[10px] md:!mb-[15px] lg:!mb-[20px] !text-[#1a5c2e]">
                  {step.title}
                </h3>
                <p className="md:text-[15px] lg:text-md -tracking-[0.16px] text-gray-600 !mb-0">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom CTA — Trezo style */}
        <div className="mt-[40px] md:mt-[50px] lg:mt-[60px] text-center">
          <Link
            href="/register"
            className="btn-press inline-block rounded-full bg-[#1a5c2e] px-[28px] py-[14px] uppercase text-[11px] font-bold text-white tracking-[1.8px] transition-all hover:bg-[#174f27]"
          >
            <span className="flex items-center justify-center gap-[12px]">
              Get Started
              <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-white/10 text-white flex items-center justify-center text-[13px]" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
