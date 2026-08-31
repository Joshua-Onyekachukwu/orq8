"use client";

import React from "react";

const OurJourney: React.FC = () => {
  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[25px]">
            {/* Mission */}
            <div className="bg-[#f8f8f8] rounded-[16px] p-[30px] md:p-[40px] lg:p-[50px]">
              <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[15px]">
                Our Mission
              </span>
              <h2 className="!mb-[15px] md:!mb-[20px] !font-light !text-2xl md:!text-3xl lg:!text-[36px] -tracking-[1px] md:-tracking-[1.5px] lg:-tracking-[2px]">
                Make AI organizations accessible to every founder
              </h2>
              <p className="md:text-[15px] lg:text-md -tracking-[0.16px] text-gray-600">
                Every solo founder deserves the operational power of a full company.
                ORQ8 gives you specialized AI employees, an Executive Agent that
                plans and coordinates, approval gates that keep you in control, and
                a memory system that makes your organization smarter over time.
                No jargon. No complexity. Just a company that runs itself.
              </p>
            </div>

            {/* Vision */}
            <div className="bg-navy-950 rounded-[16px] p-[30px] md:p-[40px] lg:p-[50px]">
              <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[15px]">
                Our Vision
              </span>
              <h2 className="!mb-[15px] md:!mb-[20px] !font-light !text-2xl md:!text-3xl lg:!text-[36px] -tracking-[1px] md:-tracking-[1.5px] lg:-tracking-[2px] !text-white">
                A world where one person can run a real company
              </h2>
              <p className="md:text-[15px] lg:text-md -tracking-[0.16px] text-white/60">
                We started ORQ8 because the tools solo founders use today
                require them to do everything themselves: accounting, marketing,
                operations, support. None of it connects. None of it runs without
                them. We built an operating system where AI employees handle the
                work, the Executive Agent coordinates the effort, and the founder
                stays in command of every consequential decision.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OurJourney;
