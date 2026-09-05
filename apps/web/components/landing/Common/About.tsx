"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";

const aboutFeatures = [
  { title: "Hire on demand", description: "No headcount, no interviews. When the work needs a researcher, a writer, or an engineer, ORQ8 hires them within your budget — instantly." },
  { title: "Approvals you control", description: "Spend, publish, deploy — anything consequential routes to you. Approve, reject, or modify in one tap. The AI proposes, you decide." },
  { title: "Budgets that hold", description: "Every department has an allocation. Every agent has a limit. Nothing overspends without your escalation." },
  { title: "Everything audited", description: "Every decision, every action, every cost — time-stamped, immutable, and visible from day one." },
];

const About: React.FC = () => {
  return (
    <div className="bg-white">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
          {/* Image Section */}
          <div>
            <div className="text-center sticky top-[86px] z-[1] md:pt-[80px] lg:pt-[50px] xl:pt-[80px] ltr:pr-[20px] rtl:pl-[20px]">
              <div className="hidden md:block -z-[1] absolute top-0 ltr:left-0 rtl:right-0 w-[336px] h-[336px] opacity-[0.12]" style={{backgroundImage:"radial-gradient(circle, currentColor 1px, transparent 1px)",backgroundSize:"16px 16px"}} />
              <div className="mx-auto md:max-w-[446px] lg:max-w-[340px] xl:max-w-[446px]">
                <Image src="/images/about.jpg" className="inline-block rounded-[10px] md:rounded-[20px]" alt="ORQ8 platform" width={670} height={810} />
              </div>
              <Image src="/images/net-profit.jpg" className="max-w-[150px] md:max-w-[250px] top-[25px] md:top-[110px] ltr:right-0 rtl:left-0 absolute inline-block rounded-[5px]" alt="net-profit" width={250} height={140} />
              <Image src="/images/activity.jpg" className="max-w-[120px] md:max-w-[183px] bottom-[25px] md:bottom-[50px] ltr:right-0 rtl:left-0 absolute inline-block rounded-[5px]" style={{boxShadow:"0px 13px 34px 0px rgba(125, 113, 150, 0.10)"}} alt="activity" width={183} height={131} />
            </div>
          </div>

          {/* Content Section */}
          <div className="ltr:xl:pl-[55px] rtl:xl:pr-[55px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orq8-orange mb-[10px] lg:mb-[15px]">About ORQ8</span>
            <h2 className="!mb-[12px] md:!mb-[15px] lg:!mb-[20px] !font-light !text-2xl md:!text-4xl lg:!text-[42px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
              A company that runs itself. <span className="text-black">Under your control.</span>
            </h2>
            <p className="md:text-md lg:text-md -tracking-[0.16px] text-gray-500">
              Every solo founder juggles 12+ disconnected tools and starts every morning copying data between tabs. ORQ8 replaces that chaos with one operating system: AI employees handle the work, you handle the decisions, and the Executive Agent coordinates everything in between.
            </p>

            <div className="my-[25px] md:my-[30px]">
              {aboutFeatures.map((f, i) => (
                <div key={i} className="relative mb-[20px] md:mb-[25px] last:mb-0 ltr:pl-[48px] rtl:pr-[48px] ltr:md:pl-[64px] rtl:md:pr-[64px] md:pt-[7px]">
                  <div className="rounded-full flex items-center justify-center w-[35px] h-[35px] md:w-[44px] md:h-[44px] text-orq8-green border border-orq8-green/20 bg-orq8-green/5 text-lg md:text-[22px] absolute top-0 ltr:left-0 rtl:right-0"><i className="ri-check-double-line"></i></div>
                  <h3 className="!font-medium !text-xl md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[10px] md:!mb-[12px]">{f.title}</h3>
                  <p className="md:text-md lg:text-md -tracking-[0.16px] text-gray-500">{f.description}</p>
                </div>
              ))}
            </div>

            <Link href="/register" className="inline-block rounded-full bg-orq8-lime px-[28px] py-[14px] uppercase text-overline font-bold text-orq8-green tracking-[1.8px] transition-all hover:bg-orq8-lime">
              <span className="flex items-center justify-center gap-[12px]">GET STARTED <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-orq8-green/10 text-orq8-green flex items-center justify-center text-2sm"></i></span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
