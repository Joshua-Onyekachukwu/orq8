"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";

// Data structure for dynamic content
const aboutContent = {
  tagline: "About ORQ8",
  heading: {
    part1: "An organization that runs itself —",
    highlighted: "under your control",
  },
  description:
    "ORQ8 is the AI organization operating system. You set the direction. Your Executive Agent plans the work, hires the specialists, and reports back. You stay in command — every consequential decision comes to you.",
  features: [
    {
      title: "Hire on demand",
      description:
        "No headcount, no interviews. When the work needs a researcher, a writer, or an engineer, ORQ8 hires them within your budget — and releases them when the job is done.",
    },
    {
      title: "Approvals you control",
      description:
        "Spend, publish, deploy — anything consequential routes to you. Approve, reject, or modify in one tap. Everything else runs without interrupting you.",
    },
    {
      title: "Budgets that hold",
      description:
        "Departments have allocations. Agents have limits. Nothing overspends without escalation, and every dollar is accounted for.",
    },
    {
      title: "Everything audited",
      description:
        "Every decision, every action, every cost — time-stamped and immutable. Your company has a memory you can trust from day one.",
    },
  ],
  cta: {
    text: "JOIN THE WAITLIST",
    href: "/#waitlist",
  },
};

const About: React.FC = () => {
  return (
    <div
      id="how-it-works"
      className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px] scroll-mt-[120px]"
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
        {/* Image Section */}
        <div>
          <div className="text-center sticky top-[86px] z-[1] md:pt-[80px] lg:pt-[50px] xl:pt-[80px] ltr:pr-[20px] rtl:pl-[20px]">
            <Image
              src="/images/dots.png"
              className="hidden md:inline-block -z-[1] absolute top-0 ltr:left-0 rtl:right-0"
              alt="dots"
              width={336}
              height={336}
            />
            <div className="mx-auto md:max-w-[446px] lg:max-w-[340px] xl:max-w-[446px]">
              <Image
                src="/images/about.jpg"
                className="inline-block rounded-[10px] md:rounded-[20px]"
                alt="the ORQ8 headquarters — one desk, one CEO"
                width={670}
                height={810}
              />
            </div>
            <Image
              src="/images/net-profit.jpg"
              className="max-w-[150px] md:max-w-[250px] top-[25px] md:top-[110px] ltr:right-0 rtl:left-0 absolute inline-block rounded-[5px]"
              alt="weekly cost dashboard"
              width={250}
              height={140}
            />
            <Image
              src="/images/activity.jpg"
              className="max-w-[120px] md:max-w-[183px] bottom-[25px] md:bottom-[50px] ltr:right-0 rtl:left-0 absolute inline-block rounded-[5px]"
              style={{
                boxShadow: "0px 13px 34px 0px rgba(125, 113, 150, 0.10)",
              }}
              alt="agent activity"
              width={183}
              height={131}
            />
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
  );
};

export default About;
