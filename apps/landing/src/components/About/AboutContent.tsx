"use client";

import React from "react";
import Image from "next/image";

// Data structure for dynamic content
const aboutContent = {
  tagline: "About ORQ8 Finance",
  heading: {
    part1: "We offer cutting edge tools for your personal",
    highlighted: "finance",
    part2: "management",
  },
  description:
    "Unlock powerful solutions designed to streamline your income and spending, enhance efficiency, and drive business growth.",
  features: [
    {
      title: "Real-Time Financial Overview",
      description:
        "Instantly view your total balance, cash flow, and net worth at a glance. Consolidates data across multiple accounts.",
    },
    {
      title: "Savings & Goal Tracking",
      description:
        "Users can create and monitor financial goals (e.g., emergency fund, travel, debt repayment). Visual goal trackers show progress toward completion.",
    },
    {
      title: "Interactive Budgeting Tools",
      description:
        "Set monthly budgets per category and monitor progress in real time. Get alerts when nearing or exceeding budget limits.",
    },
    {
      title: "Smart Categorization",
      description:
        "Transactions are automatically categorized (e.g., utilities, food, travel). Users can customize categories and rules to personalize tracking.",
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
                  alt="about-image"
                  width={670}
                  height={810}
                />
              </div>
              <Image
                src="/images/net-profit.jpg"
                className="max-w-[150px] md:max-w-[250px] top-[25px] md:top-[110px] ltr:right-0 rtl:left-0 absolute inline-block rounded-[5px]"
                alt="net-profit"
                width={250}
                height={140}
              />
              <Image
                src="/images/activity.jpg"
                className="max-w-[120px] md:max-w-[183px] bottom-[25px] md:bottom-[50px] ltr:right-0 rtl:left-0 absolute inline-block rounded-[5px]"
                style={{
                  boxShadow: "0px 13px 34px 0px rgba(125, 113, 150, 0.10)",
                }}
                alt="activity"
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
