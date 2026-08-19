"use client";

import React from "react";
import Image from "next/image";

// Data structure for dynamic content
const aboutContent = {
  tagline: "About ORQ8",
  heading: {
    part1: "One founder. One Company",
    highlighted: "of One.",
    part2: "",
  },
  description:
    "ORQ8 is the operating system for a Company of One. You set the direction. It hires the team, does the work, and reports back under your approvals and your budget.",
  features: [
    {
      title: "Human sovereignty",
      description:
        "You stay in command. Consequential actions route to you: a spend, a publish, a deploy. Approve or reject in one tap.",
    },
    {
      title: "Company memory",
      description:
        "Every decision and lesson accumulates from day one. Your organization gets smarter the longer it works with you.",
    },
    {
      title: "Budget discipline",
      description:
        "Every agent knows its budget. Costs tracked per department and per task. No surprises on the invoice.",
    },
    {
      title: "Weekly report",
      description:
        "Every Monday: what happened, what's blocked, what it cost, what's next. Five minutes to read, always.",
    },
  ],
  cta: {
    text: "JOIN THE WAITLIST",
    href: "/#waitlist",
  },
};

const AboutContent: React.FC = () => {
  return (
    <div className="pt-[70px] md:pt-[90px] lg:pt-[110px] xl:pt-[130px] 2xl:pt-[150px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
          {/* Visual Section */}
          <div>
            <div className="text-center sticky top-[86px] z-[1] md:pt-[80px] lg:pt-[50px] xl:pt-[80px] ltr:pr-[20px] rtl:pl-[20px]">
              <Image
                src="/images/dots.png"
                className="hidden md:inline-block -z-[1] absolute top-0 ltr:left-0 rtl:right-0"
                alt=""
                width={336}
                height={336}
              />
              <div className="mx-auto md:max-w-[446px] lg:max-w-[340px] xl:max-w-[446px]">
                <div className="relative rounded-[10px] md:rounded-[20px] bg-navy-950 p-[20px] md:p-[25px] text-left shadow-[0px_20px_60px_-15px_rgba(13,20,39,0.45)]">
                  {/* Command center mock */}
                  <div className="flex items-center justify-between mb-[18px]">
                    <span className="text-white text-[15px] font-bold tracking-[-0.5px]">
                      ORQ8 <span className="text-white/60">· Command Center</span>
                    </span>
                    <span className="flex items-center gap-[6px]">
                      <span className="w-[7px] h-[7px] rounded-full bg-lime animate-pulse-dot"></span>
                      <span className="w-[7px] h-[7px] rounded-full bg-lime/60 animate-pulse-dot"></span>
                      <span className="w-[7px] h-[7px] rounded-full bg-lime/30"></span>
                    </span>
                  </div>

                  <div className="rounded-[10px] border border-lime/70 bg-navy-900 p-[14px] mb-[14px]">
                    <div className="flex items-center justify-between mb-[8px]">
                      <span className="text-[10px] font-semibold uppercase tracking-[1.6px] text-white/50">
                        Approval required
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[1.2px] text-lime">
                        Spend · $250
                      </span>
                    </div>
                    <p className="!mb-0 text-[12px] leading-[1.5] text-white/80">
                      Marketing requests $250 for a LinkedIn campaign.
                    </p>
                    <div className="flex gap-[8px] mt-[12px]">
                      <span className="inline-block rounded-[8px] bg-lime text-navy-950 text-[11px] font-bold uppercase tracking-[1px] px-[12px] py-[6px]">
                        Approve
                      </span>
                      <span className="inline-block rounded-[8px] border border-white/20 text-white/70 text-[11px] font-bold uppercase tracking-[1px] px-[12px] py-[6px]">
                        Reject
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[10px] bg-navy-900 border border-white/10 p-[14px] mb-[14px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[1.6px] text-white/50">
                        Agents active
                      </span>
                      <span className="text-white text-[18px] font-bold -tracking-[0.5px]">
                        03
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-[10px]">
                      <span className="text-[11px] text-white/60">
                        Researcher · Analyzing
                      </span>
                      <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
                    </div>
                    <div className="flex items-center justify-between mt-[6px]">
                      <span className="text-[11px] text-white/60">
                        Writer · Drafting launch post
                      </span>
                      <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
                    </div>
                  </div>

                  <div className="rounded-[10px] bg-navy-900 border border-white/10 p-[14px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-[1.6px] text-white/50">
                        Weekly cost
                      </span>
                      <span className="text-white text-[18px] font-bold -tracking-[0.5px]">
                        $14.20
                      </span>
                    </div>
                    <p className="!mb-0 mt-[4px] text-[11px] text-lime">
                      within budget
                    </p>
                  </div>
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
              </span>{" "}
              {aboutContent.heading.part2}
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutContent;
