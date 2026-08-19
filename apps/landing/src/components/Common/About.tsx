"use client";

import React from "react";
import Link from "next/link";

// Data structure for dynamic content
const aboutContent = {
  tagline: "About ORQ8",
  heading: {
    part1: "One person. One Company",
    highlighted: "of One.",
  },
  description:
    "ORQ8 is the operating system for a Company of One. You set the direction. Your Executive Agent plans the work, hires the specialists, and reports back. You stay in command. Every consequential decision comes to you.",
  features: [
    {
      title: "Hire on demand",
      description:         "No headcount, no interviews. When the work needs a researcher, a writer, or an engineer, ORQ8 hires them within your budget and releases them when the job is done.",
    },
    {
      title: "Approvals you control",
      description:
        "Spend, publish, deploy. Anything consequential routes to you. Approve, reject, or modify in one tap. Everything else runs without interrupting you.",
    },
    {
      title: "Budgets that hold",
      description:
        "Departments have allocations. Agents have limits. Nothing overspends without escalation, and every dollar is accounted for.",
    },
    {
      title: "Everything audited",
      description:
        "Every decision, every action, every cost, time-stamped and immutable. Your company has a memory you can trust from day one.",
    },
  ],
  cta: {
    text: "JOIN THE WAITLIST",
    href: "/#waitlist",
  },
};

const About: React.FC = () => {
  return (
    <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
      <div
        className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]"
      >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
        {/* Visual Section: a polished ORQ8 command-center composition that
            shows the product the way a founder meets it: a decision waiting,
            agents working, and every action on the record. */}
        <div>
          <div className="relative sticky top-[86px] z-[1] md:pt-[80px] lg:pt-[50px] xl:pt-[80px] ltr:pr-[20px] rtl:pl-[20px]">
            {/* soft backdrop: indigo glow + grid mesh, same language as the hero */}
            <div
              aria-hidden
              className="absolute -inset-4 md:-inset-6 rounded-[30px] bg-[radial-gradient(55%_55%_at_25%_0%,rgba(96,93,255,0.28),transparent_70%),radial-gradient(45%_45%_at_85%_100%,rgba(200,255,50,0.12),transparent_70%)]"
            />
            <div
              aria-hidden
              className="absolute -inset-4 md:-inset-6 rounded-[30px] opacity-60"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(13,20,39,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(13,20,39,0.06) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage:
                  "radial-gradient(75% 75% at 50% 35%, black, transparent 90%)",
                WebkitMaskImage:
                  "radial-gradient(75% 75% at 50% 35%, black, transparent 90%)",
              }}
            />

            <div className="relative mx-auto max-w-[446px]">
              {/* decision card — the CEO's moment */}
              <div className="rounded-[20px] bg-navy-950 border border-white/10 p-[22px] md:p-[26px] shadow-[0_24px_70px_-24px_rgba(13,20,39,0.65)]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-[8px] uppercase font-bold tracking-[1.8px] text-[11px] text-white/60">
                    <span className="w-[8px] h-[8px] rounded-full bg-lime inline-block"></span>
                    Decision Center
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[1.6px] text-lime">
                    Awaiting you
                  </span>
                </div>
                <div className="mt-[18px] flex items-center gap-[12px]">
                  <span className="w-[38px] h-[38px] rounded-[12px] bg-lime/15 text-lime text-[18px] flex items-center justify-center flex-none">
                    <i className="ri-flashlight-line"></i>
                  </span>
                  <div className="min-w-0">
                    <p className="text-white text-[15px] md:text-base leading-[1.45]">
                      Marketing requests{" "}
                      <span className="text-lime font-semibold">$250</span> for
                      a launch campaign.
                    </p>
                    <p className="mt-[3px] text-[12px] text-white/45">
                      Within budget · Needs your approval
                    </p>
                  </div>
                </div>
                <div className="mt-[18px] flex gap-[10px]">
                  <span className="flex-1 text-center rounded-[50px] bg-lime text-black text-[13px] font-bold py-[9px]">
                    Approve
                  </span>
                  <span className="flex-1 text-center rounded-[50px] border border-white/20 text-white/80 text-[13px] py-[9px]">
                    Modify
                  </span>
                  <span className="flex-1 text-center rounded-[50px] border border-white/20 text-white/80 text-[13px] py-[9px]">
                    Reject
                  </span>
                </div>
              </div>

              {/* side row: agents + report */}
              <div className="mt-[16px] grid grid-cols-2 gap-[16px]">
                <div className="rounded-[16px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/15 p-[16px] shadow-sm">
                  <p className="uppercase font-bold tracking-[1.6px] text-[10px] text-gray-400 mb-[12px]">
                    Active now
                  </p>
                  {[
                    { n: "Researcher", s: "Market data" },
                    { n: "Writer", s: "Drafting post" },
                    { n: "Engineer", s: "PR #142" },
                  ].map((a) => (
                    <div key={a.n} className="flex items-center justify-between py-[5px]">
                      <span className="text-[13px] font-medium text-navy-950 dark:text-white/85">
                        {a.n}
                      </span>
                      <span className="flex items-center gap-[6px] text-[11px] text-gray-400">
                        <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
                        {a.s}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-[16px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/15 p-[16px] shadow-sm">
                  <p className="uppercase font-bold tracking-[1.6px] text-[10px] text-gray-400 mb-[12px]">
                    Weekly cost
                  </p>
                  <p className="text-[26px] font-light leading-none text-navy-950 dark:text-white -tracking-[0.8px]">
                    $14.20
                  </p>
                  <p className="mt-[6px] text-[11px] text-lime font-semibold">
                    Within budget
                  </p>
                  <div className="mt-[14px] space-y-[8px]">
                    {[
                      { d: "Marketing", pct: "62%" },
                      { d: "Engineering", pct: "47%" },
                    ].map((b) => (
                      <div key={b.d}>
                        <div className="flex items-center justify-between text-[10px] mb-[4px]">
                          <span className="text-gray-400">{b.d}</span>
                          <span className="text-gray-400">{b.pct}</span>
                        </div>
                        <div className="h-[4px] rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-lime"
                            style={{ width: b.pct }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* audit trail strip */}
              <div className="mt-[16px] rounded-[16px] bg-navy-950 border border-white/10 px-[18px] py-[14px] flex items-center justify-between gap-[12px]">
                <span className="flex items-center gap-[10px] min-w-0">
                  <i className="ri-check-double-line text-lime text-[18px] flex-none"></i>
                  <span className="truncate text-[13px] text-white/75">
                    Writer published launch post · 2 min ago
                  </span>
                </span>
                <span className="flex-none flex items-center gap-[6px] text-[10px] font-semibold uppercase tracking-[1.4px] text-white/40">
                  <i className="ri-lock-line"></i>
                  Audited
                </span>
              </div>

              {/* floating badge */}
              <div className="absolute -top-[14px] ltr:-right-[10px] rtl:-left-[10px] animate-bounce-slow rounded-[14px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/15 px-[14px] py-[10px] shadow-xl">
                <p className="uppercase font-bold tracking-[1.6px] text-[10px] text-lime">
                  +1 agent hired
                </p>
                <p className="mt-[3px] text-[11px] text-gray-500 dark:text-gray-400">
                  Marketing specialist · this week
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="ltr:xl:pl-[55px] rtl:xl:pr-[55px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
            {aboutContent.tagline}
          </span>

          <h2 className="!mb-[12px] md:!mb-[15px] lg:!mb-[20px] !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            {aboutContent.heading.part1}{" "}
            <span className="text-primary-500">
              {aboutContent.heading.highlighted}
            </span>
          </h2>

          <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
            {aboutContent.description}
          </p>

          <div className="my-[25px] md:my-[30px]">
            {aboutContent.features.map((feature, index) => (
              <div
                key={index}
                className="relative mb-[20px] md:mb-[25px] last:mb-0 ltr:pl-[48px] rtl:pr-[48px] ltr:md:pl-[64px] rtl:md:pr-[64px] md:pt-[7px]"
              >
                <div className="rounded-full flex items-center justify-center w-[35px] h-[35px] md:w-[44px] md:h-[44px] text-primary-500 border border-[#c8ff32] dark:border-gray-800 text-lg md:text-[22px] absolute top-0 ltr:left-0 rtl:right-0">
                  <i className="ri-check-double-line"></i>
                </div>
                <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[10px] md:!mb-[12px]">
                  {feature.title}
                </h3>
                <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          <Link
            href={aboutContent.cta.href}
            className="inline-block rounded-[60px] bg-orange-400 p-[7px] md:p-[10px] uppercase text-xs font-bold text-white tracking-[1px] md:tracking-[1.8px] transition-all hover:bg-[#c8ff32] hover:text-black"
          >
            <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
              {aboutContent.cta.text}{" "}
              <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
            </span>
          </Link>
        </div>
      </div>
      </div>
    </div>
  );
};

export default About;
