import React from "react";
import Link from "next/link";

const steps = [
  {
    id: 1,
    number: "01",
    title: "You give direction",
    description:
      "Tell ORQ8 your goal in plain words. One sentence or a full brief — that's the whole input.",
  },
  {
    id: 2,
    number: "02",
    title: "It plans and hires",
    description:
      "The Executive Agent breaks the goal into tasks, picks the right people, and assigns the work within your budget.",
  },
  {
    id: 3,
    number: "03",
    title: "Agents execute",
    description:
      "Your AI team works across your tools — writing, coding, researching, analyzing. Big actions come back for approval.",
  },
  {
    id: 4,
    number: "04",
    title: "You see the outcome",
    description:
      "Approve in one tap. Every Monday, a report on what happened, what it cost, and what's next.",
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="relative z-[1] bg-[#0A0A0B] py-[80px] md:py-[120px] lg:py-[160px] overflow-hidden"
    >
      {/* Subtle grid texture */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      <div className="relative container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1200px] mx-auto px-[20px] md:px-[24px]">
        {/* Section header */}
        <div className="max-w-[680px] mx-auto text-center mb-[60px] md:mb-[80px] lg:mb-[100px]">
          <span className="block uppercase font-bold tracking-[0.2em] text-[11px] text-[#B8FF66] mb-[16px]">
            How it works
          </span>
          <h2 className="!mb-[20px] !font-normal !text-[32px] md:!text-[40px] lg:!text-[48px] !leading-[1.15] !text-white -tracking-[0.5px] md:-tracking-[1px]">
            You give direction.{" "}
            <span className="!font-medium text-[#B8FF66]">Your Company of One does the rest.</span>
          </h2>
          <p className="text-white/50 lg:text-[16px] max-w-[520px] mx-auto !mb-0 !leading-relaxed">
            Four steps, one loop. Most of it runs without you. The consequential always comes back to you.
          </p>
        </div>

        {/* Desktop: 4 steps in a row with connecting line */}
        <div className="hidden lg:block relative">
          {/* Connecting line behind cards */}
          <div className="absolute top-[32px] left-[calc(12.5%+12px)] right-[calc(12.5%+12px)] h-[1px] bg-white/[0.08]" />

          <div className="grid grid-cols-4 gap-[40px] relative">
            {steps.map((step) => (
              <div key={step.id} className="relative">
                {/* Step badge */}
                <div className="relative z-[1] mb-[24px]">
                  <div className="w-[64px] h-[64px] rounded-full bg-[#B8FF66] flex items-center justify-center">
                    <span className="text-[#0A0A0B] text-[14px] font-bold tracking-wide">
                      {step.number}
                    </span>
                  </div>
                </div>

                {/* Card */}
                <div className="group bg-white/[0.03] border border-white/[0.06] rounded-[12px] p-[28px] transition-all duration-300 hover:bg-white/[0.05] hover:border-white/[0.12]">
                  <h3 className="!font-semibold !text-[18px] !text-white !leading-[1.3] !mb-[12px]">
                    {step.title}
                  </h3>
                  <p className="text-white/45 text-[15px] leading-[1.65] !mb-0">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Mobile/Tablet: vertical with left connecting line */}
        <div className="lg:hidden relative">
          {/* Vertical connecting line */}
          <div className="absolute top-[32px] bottom-[32px] left-[31px] w-[1px] bg-white/[0.08]" />

          <div className="space-y-[20px]">
            {steps.map((step) => (
              <div key={step.id} className="relative flex items-start gap-[24px]">
                {/* Step badge */}
                <div className="relative z-[1] flex-none">
                  <div className="w-[64px] h-[64px] rounded-full bg-[#B8FF66] flex items-center justify-center">
                    <span className="text-[#0A0A0B] text-[13px] font-bold tracking-wide">
                      {step.number}
                    </span>
                  </div>
                </div>

                {/* Card */}
                <div className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-[12px] p-[24px] transition-all duration-200 hover:bg-white/[0.05] hover:border-white/[0.12]">
                  <h3 className="!font-semibold !text-[17px] !text-white !leading-[1.3] !mb-[8px]">
                    {step.title}
                  </h3>
                  <p className="text-white/45 text-[14px] leading-[1.6] !mb-0">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA bar */}
        <div className="mt-[50px] md:mt-[60px] lg:mt-[80px] border border-white/[0.06] bg-white/[0.02] rounded-[12px] px-[28px] md:px-[36px] py-[24px] md:py-[28px] flex flex-col lg:flex-row items-center justify-between gap-[20px]">
          <div className="flex items-center gap-[16px] flex-col md:flex-row text-center lg:text-left">
            <div className="w-[44px] h-[44px] rounded-full bg-[#B8FF66]/10 text-[#B8FF66] flex items-center justify-center flex-none">
              <svg viewBox="0 0 24 24" className="w-[20px] h-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </div>
            <div>
              <h3 className="!font-semibold !text-[16px] md:!text-[17px] !text-white !mb-[4px]">
                The loop never stops
              </h3>
              <p className="text-white/45 text-[14px] md:text-[15px] max-w-[440px] !mb-0 !leading-relaxed">
                Your company keeps working while you sleep. Every Monday the report brings you back up to speed.
              </p>
            </div>
          </div>

          <Link
            href="/#waitlist"
            className="btn-press group inline-block shrink-0 rounded-full bg-[#B8FF66] px-[28px] py-[12px] md:py-[14px] uppercase text-[11px] font-bold text-[#0A0A0B] tracking-[0.15em] hover:bg-[#A3E855] transition-colors"
          >
            <span className="flex items-center justify-center gap-[12px]">
              Join the waitlist
              <i className="ri-arrow-right-up-line w-[28px] h-[28px] rounded-full bg-[#0A0A0B]/10 text-[#0A0A0B] flex items-center justify-center text-sm transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[1px]" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
