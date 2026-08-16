import React from "react";
import Link from "next/link";

interface Step {
  id: number;
  icon: string;
  title: string;
  description: string;
}

const steps: Step[] = [
  {
    id: 1,
    icon: "ri-chat-3-line",
    title: "Give direction",
    description:
      "Say it in plain words — “I think we should build an AI support product.” No specs, no project plans. That’s the whole brief.",
  },
  {
    id: 2,
    icon: "ri-team-line",
    title: "The Executive Agent plans and hires",
    description:
      "Your Exec gathers what the company knows, turns your direction into a plan, and hires the specialists it needs — inside your budget.",
  },
  {
    id: 3,
    icon: "ri-terminal-box-line",
    title: "Agents do the work",
    description:
      "Researchers, writers, and engineers execute across your tools. Spend, publish, and deploy stop at your approval gate — everything else runs.",
  },
  {
    id: 4,
    icon: "ri-calendar-check-line",
    title: "You approve. The Monday report closes the loop",
    description:
      "Consequential decisions come to you — approve or reject in one tap. Every Monday: what happened, what it cost, what needs your decision.",
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="relative z-[1] bg-navy-950 py-[70px] md:py-[90px] lg:py-[110px] xl:py-[140px]"
    >
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="max-w-[720px] mx-auto text-center mb-[35px] md:mb-[50px] lg:mb-[60px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-lime mb-[10px] lg:mb-[15px]">
            How it works
          </span>
          <h2 className="!mb-[12px] md:!mb-[15px] !font-light !text-[28px] md:!text-4xl lg:!text-[46px] !leading-[1.15] !text-white -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            You give direction.{" "}
            <span className="text-lime">The company does the rest.</span>
          </h2>
          <p className="text-white/70 lg:text-[15px] xl:text-md">
            Four steps, one loop. Most of it runs without you — the
            consequential always comes back to you.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-[20px] md:gap-[25px]">
          {steps.map((step) => (
            <div
              key={step.id}
              className="lift-card group relative rounded-[15px] md:rounded-[20px] border border-white/10 bg-navy-900 p-[25px] md:p-[30px] transition-colors hover:border-lime/50"
            >
              <div className="flex items-center justify-between mb-[25px] md:mb-[30px]">
                <span className="w-[46px] h-[46px] md:w-[50px] md:h-[50px] rounded-full bg-lime/10 text-lime flex items-center justify-center text-[22px] md:text-[24px] leading-none transition-colors group-hover:bg-lime group-hover:text-navy-950">
                  <i className={step.icon}></i>
                </span>
                <span className="font-bold text-[20px] md:text-[22px] text-white/25 tracking-[2px]">
                  0{step.id}
                </span>
              </div>
              <h3 className="!font-light !text-[19px] md:!text-[21px] !text-white !leading-[1.3] -tracking-[.44px] md:-tracking-[.8px] !mb-[10px] md:!mb-[12px]">
                {step.title}
              </h3>
              <p className="text-white/65 md:text-[15px] lg:text-md -tracking-[0.16px]">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-[25px] md:mt-[35px] rounded-[15px] md:rounded-[20px] border border-white/10 bg-navy-900/60 px-[25px] md:px-[40px] py-[25px] md:py-[30px] flex flex-col lg:flex-row items-center justify-between gap-[20px]">
          <div className="flex items-start md:items-center gap-[15px] md:gap-[20px] text-center lg:text-left flex-col md:flex-row">
            <span className="w-[46px] h-[46px] md:w-[50px] md:h-[50px] rounded-full bg-lime/10 text-lime flex items-center justify-center text-[22px] md:text-[24px] leading-none shrink-0">
              <i className="ri-loop-left-line"></i>
            </span>
            <div>
              <h3 className="!font-light !text-[19px] md:!text-[21px] !text-white !mb-[6px] -tracking-[.44px] md:-tracking-[.8px]">
                The loop never stops
              </h3>
              <p className="text-white/65 md:text-[15px] lg:text-md -tracking-[0.16px] max-w-[560px]">
                Your company keeps working while you sleep. Every Monday the
                report brings you back up to speed — then you give the next
                direction.
              </p>
            </div>
          </div>

          <Link
            href="/#waitlist"
            className="btn-press group inline-block shrink-0 rounded-[60px] bg-emerald p-[7px] md:p-[10px] uppercase text-xs font-bold text-navy-950 tracking-[1px] md:tracking-[1.8px] hover:bg-lime"
          >
            <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
              Join the waitlist{" "}
              <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-navy-950/15 text-navy-950 flex items-center justify-center text-md transition-transform duration-300 group-hover:translate-x-[2px] group-hover:-translate-y-[1px]"></i>
            </span>
          </Link>
        </div>
      </div>

      <div className="absolute inset-0 -z-[1] overflow-hidden">
        <div className="bg-lime blur-[302px] opacity-[0.12] rounded-[672px] w-[320px] md:w-[672px] h-[527px] absolute ltr:left-0 rtl:right-0 ltr:md:left-[10%] rtl:md:right-[10%] bottom-[40%]"></div>
        <div className="bg-emerald blur-[362px] opacity-[0.12] rounded-[556px] w-[320px] md:w-[556px] h-[466px] absolute ltr:right-0 rtl:left-0 ltr:md:right-[15%] rtl:md:left-[15%] bottom-[5%]"></div>
      </div>
    </section>
  );
};

export default HowItWorks;
