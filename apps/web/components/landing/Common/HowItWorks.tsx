import React from "react";
import Link from "next/link";

const STEP_DIVIDER: Record<number, string> = {
  0: "md:pr-[32px]",
  1: "border-t border-hairline md:border-t-0 md:border-l md:px-[32px]",
  2: "border-t border-hairline md:border-t-0 md:border-l md:pl-[32px]",
};

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
    title: "Your company executes",
    description:
      "The Executive Agent plans the work, hires the right specialists, and coordinates them across your tools. Big actions come back for approval.",
  },
  {
    id: 3,
    number: "03",
    title: "You see the outcome",
    description:
      "Approve in one tap. Every Monday, a report on what happened, what it cost, and what's next.",
  },
];

/**
 * Three steps, told as a sequence rather than three floating cards. No fills, no
 * badges, no glow: a hairline between the columns and a short lime rule over
 * each one does the work, which keeps the section as quiet as the rest of the
 * page and leaves the colour to the parts that mean something.
 */
const HowItWorks: React.FC = () => {
  return (
    <section
      id="how-it-works"
      className="relative border-t border-hairline bg-surface-white py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]"
    >
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="mb-[40px] md:mb-[56px] lg:mb-[64px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="inline-flex items-center gap-[8px] uppercase font-bold tracking-[1.8px] text-xs text-warm-ink">
            <span className="h-[6px] w-[6px] bg-accent-lime" aria-hidden="true" />
            How it works
          </span>
          <h2 className="!mt-[16px] !mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            You give direction.{" "}
            <span className="text-brand-ink">Your Company of One does the rest.</span>
          </h2>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3">
          {steps.map((step, index) => (
            <li
              key={step.id}
              className={`py-[28px] first:pt-0 last:pb-0 md:py-0 ${STEP_DIVIDER[index] ?? ""}`}
            >
              <span className="block h-[3px] w-[28px] bg-accent-lime" aria-hidden="true" />
              <span className="mt-[20px] block font-mono text-2xs font-semibold tracking-[0.24em] text-ink-muted">
                {step.number}
              </span>
              <h3 className="!mt-[12px] !mb-0 !text-lg md:!text-xl !font-medium !tracking-[-0.4px] !text-ink">
                {step.title}
              </h3>
              <p className="!mt-[8px] !mb-0 text-2sm text-ink-muted lg:!text-md">
                {step.description}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-[48px] md:mt-[64px] text-center">
          <Link
            href="/register"
            className="btn-press inline-block rounded-full bg-brand-deep px-[28px] py-[14px] uppercase text-overline font-bold text-white tracking-[1.8px] transition-colors hover:bg-brand"
          >
            <span className="flex items-center justify-center gap-[12px]">
              Get Started
              <i
                className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-white/10 text-white flex items-center justify-center text-2sm"
                aria-hidden="true"
              />
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
