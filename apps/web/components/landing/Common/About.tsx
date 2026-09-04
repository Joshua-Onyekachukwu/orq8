"use client";

import React from "react";
import Link from "next/link";

const aboutFeatures = [
  {
    title: "Hire on demand",
    description:
      "No headcount, no interviews. When the work needs a researcher, a writer, or an engineer, ORQ8 hires them within your budget.",
  },
  {
    title: "Approvals you control",
    description:
      "Spend, publish, deploy. Anything consequential routes to you. Approve, reject, or modify in one tap.",
  },
  {
    title: "Budgets that hold",
    description:
      "Departments have allocations. Agents have limits. Nothing overspends without escalation.",
  },
  {
    title: "Everything audited",
    description:
      "Every decision, every action, every cost, time-stamped and immutable. Your company has a memory.",
  },
];

const About: React.FC = () => {
  return (
    <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
        {/* Image / Visual Section — Trezo style with decorative dots */}
        <div>
          <div className="text-center sticky top-[86px] z-[1] md:pt-[80px] lg:pt-[50px] xl:pt-[80px] ltr:pr-[20px] rtl:pl-[20px]">
            {/* Decorative dots pattern */}
            <div className="hidden md:block -z-[1] absolute top-0 ltr:left-0 rtl:right-0 w-[336px] h-[336px] opacity-[0.15] dark:opacity-[0.05]"
              style={{
                backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            />

            {/* Organization hierarchy — ORQ8 product visualization */}
            <div className="mx-auto md:max-w-[446px] lg:max-w-[340px] xl:max-w-[446px]">
              <div className="bg-canvas dark:bg-[#0f1628] rounded-[20px] border border-hairline dark:border-white/[0.06] p-[30px] md:p-[40px]">
                {/* Founder */}
                <div className="flex justify-center mb-[20px]">
                  <div className="flex items-center gap-[12px] px-[20px] py-[14px] bg-navy-950 dark:bg-white/[0.08] rounded-[12px]">
                    <div className="w-[36px] h-[36px] rounded-[10px] bg-emerald flex items-center justify-center flex-none">
                      <svg className="w-[18px] h-[18px] text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-white text-[14px] font-semibold leading-tight">You</p>
                      <p className="text-white/40 text-[10px] font-medium uppercase tracking-wider">Founder</p>
                    </div>
                  </div>
                </div>

                {/* Connector */}
                <div className="flex justify-center mb-[16px]">
                  <div className="w-[1px] h-[24px] bg-hairline dark:bg-white/10" />
                </div>

                {/* Executive Agent */}
                <div className="flex justify-center mb-[16px]">
                  <div className="flex items-center gap-[12px] px-[20px] py-[14px] bg-navy-950 dark:bg-white/[0.08] rounded-[12px] border border-emerald/20">
                    <div className="w-[36px] h-[36px] rounded-[10px] bg-emerald/20 flex items-center justify-center flex-none">
                      <svg className="w-[18px] h-[18px] text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="text-white text-[14px] font-semibold leading-tight">Executive Agent</p>
                      <p className="text-white/40 text-[10px] font-medium uppercase tracking-wider">Plans & Coordinates</p>
                    </div>
                  </div>
                </div>

                {/* Connector lines */}
                <div className="flex justify-center gap-[48px] mb-[16px]">
                  <div className="w-[1px] h-[16px] bg-hairline dark:bg-white/10" />
                  <div className="w-[1px] h-[16px] bg-hairline dark:bg-white/10" />
                  <div className="w-[1px] h-[16px] bg-hairline dark:bg-white/10" />
                </div>

                {/* Agents */}
                <div className="grid grid-cols-3 gap-[10px]">
                  {[
                    { name: "Researcher", color: "bg-blue-500/10 text-blue-500" },
                    { name: "Writer", color: "bg-purple-500/10 text-purple-500" },
                    { name: "Engineer", color: "bg-amber-500/10 text-amber-500" },
                  ].map((agent) => (
                    <div key={agent.name} className="bg-white dark:bg-white/[0.03] rounded-[10px] border border-hairline dark:border-white/[0.06] p-[12px] text-center">
                      <div className={`w-[28px] h-[28px] rounded-[8px] ${agent.color} flex items-center justify-center mx-auto mb-[8px]`}>
                        <svg className="w-[14px] h-[14px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <p className="text-ink dark:text-white/80 text-[11px] font-medium">{agent.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Floating badge — Trezo style */}
            <div
              className="max-w-[150px] md:max-w-[250px] top-[25px] md:top-[110px] ltr:right-0 rtl:left-0 absolute inline-block rounded-[10px] bg-white dark:bg-[#0f1628] border border-hairline dark:border-white/[0.06] p-[12px] md:p-[16px] text-left"
              style={{ boxShadow: "0px 13px 34px 0px rgba(125, 113, 150, 0.10)" }}
            >
              <p className="text-emerald text-[12px] font-semibold">+1 agent hired</p>
              <p className="text-ink-muted dark:text-white/40 text-[10px] mt-[2px]">Marketing specialist</p>
            </div>
          </div>
        </div>

        {/* Content Section — Trezo style with features list */}
        <div className="ltr:xl:pl-[55px] rtl:xl:pr-[55px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-emerald mb-[10px] lg:mb-[15px]">
            About ORQ8
          </span>

          <h2 className="!mb-[12px] md:!mb-[15px] lg:!mb-[20px] !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
            An organization that runs itself.{" "}
            <span className="text-emerald">Under your control.</span>
          </h2>

          <p className="md:text-[15px] lg:text-md -tracking-[0.16px] text-ink-muted dark:text-white/60">
            ORQ8 is the AI organization operating system. You set the direction.
            Your Executive Agent plans the work, hires the specialists, and
            reports back. You stay in command.
          </p>

          <div className="my-[25px] md:my-[30px]">
            {aboutFeatures.map((feature, index) => (
              <div
                key={index}
                className="relative mb-[20px] md:mb-[25px] last:mb-0 ltr:pl-[48px] rtl:pr-[48px] ltr:md:pl-[64px] rtl:md:pr-[64px] md:pt-[7px]"
              >
                <div className="rounded-full flex items-center justify-center w-[35px] h-[35px] md:w-[44px] md:h-[44px] text-emerald border border-emerald/30 dark:border-emerald/20 text-lg md:text-[22px] absolute top-0 ltr:left-0 rtl:right-0">
                  <i className="ri-check-double-line"></i>
                </div>
                <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[10px] md:!mb-[12px]">
                  {feature.title}
                </h3>
                <p className="md:text-[15px] lg:text-md -tracking-[0.16px] text-ink-muted dark:text-white/60">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>

          <Link
            href="/register"
            className="inline-block rounded-[60px] bg-emerald p-[7px] md:p-[10px] uppercase text-xs font-bold text-white tracking-[1px] md:tracking-[1.8px] transition-all hover:bg-emerald-dark hover:text-white"
          >
            <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
              GET STARTED{" "}
              <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default About;
