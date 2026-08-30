import React from "react";
import Link from "next/link";

const steps = [
  {
    id: 1,
    number: "01",
    title: "You give direction",
    description:
      "Tell ORQ8 your goal in plain words. One sentence or a full brief — that's the whole input.",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: 2,
    number: "02",
    title: "It plans and hires",
    description:
      "The Executive Agent breaks the goal into tasks, picks the right people, and assigns the work within your budget.",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: 3,
    number: "03",
    title: "Agents execute",
    description:
      "Your AI team works across your tools — writing, coding, researching, analyzing. Big actions come back for approval.",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: 4,
    number: "04",
    title: "You see the outcome",
    description:
      "Approve in one tap. Every Monday, a report on what happened, what it cost, and what's next.",
    icon: (
      <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="relative z-[1] bg-navy-950 py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] overflow-hidden"
    >
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        {/* Section header */}
        <div className="max-w-[680px] mx-auto text-center mb-[50px] md:mb-[60px] lg:mb-[70px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-[11px] text-orange-400 mb-[12px] lg:mb-[14px]">
            How it works
          </span>
          <h2 className="!mb-[14px] md:!mb-[16px] !font-light !text-[28px] md:!text-4xl lg:!text-[44px] !leading-[1.15] !text-white -tracking-[0.5px] md:-tracking-[1.5px] lg:-tracking-[2px]">
            You give direction.{" "}
            <span className="!font-medium text-lime">Your Company of One does the rest.</span>
          </h2>
          <p className="text-white/50 lg:text-[15px] xl:text-[16px] max-w-[520px] mx-auto !mb-0 !leading-relaxed">
            Four steps, one loop. Most of it runs without you. The consequential always comes back to you.
          </p>
        </div>

        {/* Desktop: 4 steps in a row with connecting line */}
        <div className="hidden lg:block relative">
          {/* Connecting line behind cards */}
          <div className="absolute top-[44px] left-[calc(12.5%+12px)] right-[calc(12.5%+12px)] h-[1px] bg-white/[0.08]" />

          <div className="grid grid-cols-4 gap-[32px] relative">
            {steps.map((step) => (
              <div key={step.id} className="relative">
                {/* Step badge */}
                <div className="relative z-[1] mb-[20px]">
                  <div className="w-[56px] h-[56px] rounded-full bg-white flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
                    <span className="text-navy-900 text-[13px] font-bold tracking-wide">
                      {step.number}
                    </span>
                  </div>
                </div>

                {/* Card */}
                <div className="group bg-white/[0.05] border border-white/[0.08] rounded-[14px] p-[24px] transition-all duration-300 hover:bg-white/[0.08] hover:border-white/[0.15]">
                  <div className="w-[40px] h-[40px] rounded-[10px] bg-white/[0.06] border border-white/[0.08] flex items-center justify-center mb-[16px] text-white/50 transition-colors duration-200 group-hover:text-white/80 group-hover:border-white/[0.15]">
                    {step.icon}
                  </div>
                  <h3 className="!font-semibold !text-[17px] !text-white !leading-[1.3] !mb-[8px]">
                    {step.title}
                  </h3>
                  <p className="text-white/45 text-[14px] leading-[1.65] !mb-0">
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
          <div className="absolute top-[28px] bottom-[28px] left-[27px] w-[1px] bg-white/[0.08]" />

          <div className="space-y-[16px]">
            {steps.map((step) => (
              <div key={step.id} className="relative flex items-start gap-[20px]">
                {/* Step badge */}
                <div className="relative z-[1] flex-none">
                  <div className="w-[56px] h-[56px] rounded-full bg-white flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.3)]">
                    <span className="text-navy-900 text-[12px] font-bold tracking-wide">
                      {step.number}
                    </span>
                  </div>
                </div>

                {/* Card */}
                <div className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-[14px] p-[20px] transition-all duration-200 hover:bg-white/[0.08] hover:border-white/[0.15]">
                  <div className="flex items-center gap-[10px] mb-[8px]">
                    <div className="w-[32px] h-[32px] rounded-[8px] bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/40">
                      {step.icon}
                    </div>
                    <h3 className="!font-semibold !text-[16px] !text-white !leading-[1.3]">
                      {step.title}
                    </h3>
                  </div>
                  <p className="text-white/45 text-[13px] leading-[1.6] !mb-0 pl-[42px]">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom CTA bar */}
        <div className="mt-[40px] md:mt-[50px] lg:mt-[60px] border border-white/[0.08] bg-white/[0.03] rounded-[14px] md:rounded-[16px] px-[24px] md:px-[32px] py-[20px] md:py-[24px] flex flex-col lg:flex-row items-center justify-between gap-[16px]">
          <div className="flex items-center gap-[14px] flex-col md:flex-row text-center lg:text-left">
            <div className="w-[40px] h-[40px] rounded-full bg-lime/10 text-lime flex items-center justify-center flex-none">
              <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </div>
            <div>
              <h3 className="!font-semibold !text-[15px] md:!text-[16px] !text-white !mb-[3px]">
                The loop never stops
              </h3>
              <p className="text-white/45 text-[13px] md:text-[14px] max-w-[440px] !mb-0 !leading-relaxed">
                Your company keeps working while you sleep. Every Monday the report brings you back up to speed.
              </p>
            </div>
          </div>

          <Link
            href="/#waitlist"
            className="btn-press group inline-block shrink-0 rounded-full bg-lime px-[24px] py-[10px] md:py-[12px] uppercase text-[11px] font-bold text-navy-900 tracking-[1.5px] hover:bg-emerald transition-colors"
          >
            <span className="flex items-center justify-center gap-[12px]">
              Join the waitlist
              <i className="ri-arrow-right-up-line w-[28px] h-[28px] rounded-full bg-navy-900/15 text-navy-900 flex items-center justify-center text-sm transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[1px]" />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
