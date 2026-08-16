"use client";

import React from "react";
import Image from "next/image";

interface JourneyData {
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  mission: {
    title: string;
    description: string;
  };
  vision: {
    title: string;
    description: string;
  };
}

const journeyData: JourneyData = {
  title: "OUR JOURNEY SO FAR",
  subtitle: "Building better brands with future-focused digital",
  description: "At ORQ8, we believe that managing your finances shouldn't be complicated or intimidating. That's why we've built a powerful yet user-friendly platform that brings together all your accounts, insights, and tools into one seamless experience.",
  imageUrl: "/images/journey.jpg",
  mission: {
    title: "Our Mission",
    description: "Our mission is simple: to make financial wellness accessible for everyone. We combine cutting-edge technology with smart design to help users make informed decisions, stay organized, and reach their financial goals with confidence. No jargon, no hidden fees—just clarity, control, and real results."
  },
  vision: {
    title: "Our Vision",
    description: "We started ORQ8 because we were tired of switching between apps just to get a sense of our financial health. Budgeting apps were too basic, investment tools were too complicated, and no single solution truly brought it all together. So we created one."
  }
};

const OurJourney: React.FC = () => {
  return (
    <>
      <div className="pt-[70px] md:pt-[90px] lg:pt-[110px] xl:pt-[130px] 2xl:pt-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
              {journeyData.title}
            </span>

            <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px] lg:max-w-[770px]">
              {journeyData.subtitle}{" "}
              <span className="text-primary-500">financial solutions</span>
              —that&apos;s our story and mission.
            </h2>

            <p className="md:text-[15px] lg:text-md -tracking-[0.16px] lg:max-w-[636px] ltr:lg:ml-auto rtl:lg:mr-auto mt-[10px] lg:mt-[15px] xl:mt-0">
              {journeyData.description}
            </p>
          </div>

          <div className="text-center rounded-[10px] md:rounded-[20px] mb-[30px] md:mb-[40px] lg:mb-[50px]">
            <Image
              src={journeyData.imageUrl}
              className="inline-block rounded-[10px] md:rounded-[20px]"
              alt="journey-image"
              width={1296}
              height={420}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-[25px]">
            <div>
              <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[10px] md:!mb-[12px] lg:!mb-[15px]">
                {journeyData.mission.title}
              </h3>
              <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                {journeyData.mission.description}
              </p>
            </div>

            <div>
              <h3 className="!font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[10px] md:!mb-[12px] lg:!mb-[15px]">
                {journeyData.vision.title}
              </h3>
              <p className="md:text-[15px] lg:text-md -tracking-[0.16px]">
                {journeyData.vision.description}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OurJourney;