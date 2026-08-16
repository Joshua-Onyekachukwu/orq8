"use client";

import React from "react";

interface FeatureItem {
  id: number;
  icon: string;
  title: string;
  description: string;
  /* position of the box around the core; outer div handles the anchor so the
     float animation never fights the centering translate */
  pos: string;
  /* SVG end point of the connector line, in 0-100 viewBox space */
  end: [number, number];
}

const features: FeatureItem[] = [
  {
    id: 1,
    icon: "ri-verified-badge-fill",
    title: "Approval gates",
    description:
      "Spend, publish, deploy. Anything consequential routes to you. Approve, reject, or modify in one tap.",
    pos: "ltr:left-0 rtl:right-0 top-0",
    end: [9, 12],
  },
  {
    id: 2,
    icon: "ri-key-2-fill",
    title: "Encrypted keys",
    description:
      "Provider credentials encrypted at rest, masked in the UI, rotatable without downtime.",
    pos: "ltr:right-0 rtl:left-0 top-0",
    end: [91, 12],
  },
  {
    id: 3,
    icon: "ri-file-text-fill",
    title: "Audit trail",
    description:
      "Every decision, action, and cost, time-stamped and immutable. A memory you can trust.",
    pos: "ltr:left-0 rtl:right-0 top-1/2 -translate-y-1/2",
    end: [5, 50],
  },
  {
    id: 4,
    icon: "ri-brain-fill",
    title: "Company memory",
    description:
      "Decisions and lessons accumulate from day one. The organization gets smarter over time.",
    pos: "ltr:right-0 rtl:left-0 top-1/2 -translate-y-1/2",
    end: [95, 50],
  },
  {
    id: 5,
    icon: "ri-pie-chart-2-fill",
    title: "Cost-aware routing",
    description:
      "Every task knows its budget. Costs tracked per department and per agent. No surprises.",
    pos: "ltr:left-0 rtl:right-0 bottom-0",
    end: [9, 88],
  },
  {
    id: 6,
    icon: "ri-calendar-check-fill",
    title: "Weekly report",
    description:
      "Every Monday: what happened, what's blocked, what it cost, what's next. Five minutes to read.",
    pos: "ltr:right-0 rtl:left-0 bottom-0",
    end: [91, 88],
  },
];

const Core: React.FC<{ compact?: boolean }> = ({ compact }) => {
  if (compact) {
    return (
      <div className="relative w-[150px] h-[150px] mx-auto mb-[34px]">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full bg-lime blur-[60px] opacity-[0.14]"
        />
        <div className="relative w-full h-full rounded-full bg-navy-950 border border-white/10 shadow-[0_20px_50px_-18px_rgba(13,20,39,0.6)] flex flex-col items-center justify-center">
          <span className="text-white text-[26px] font-bold tracking-[-1.4px] leading-none">
            ORQ8
          </span>
          <span className="mt-[10px] flex items-center gap-[7px]">
            <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
            <span className="text-[8px] font-semibold uppercase tracking-[2.2px] text-white/60">
              System online
            </span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[3]">
      {/* soft lime glow behind the core */}
      <div
        aria-hidden
        className="absolute w-[400px] h-[400px] rounded-full bg-lime blur-[110px] opacity-[0.10]"
      />
      {/* outer ring */}
      <div aria-hidden className="absolute w-[360px] h-[360px]">
        <div className="animate-orbit-slower absolute inset-0 rounded-full border border-dashed border-[#E5E5E5] dark:border-white/15">
          <span className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full bg-primary-500/70"></span>
          <span className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-[10px] h-[10px] rounded-full bg-primary-500/70"></span>
        </div>
      </div>
      {/* inner ring */}
      <div aria-hidden className="absolute w-[280px] h-[280px]">
        <div className="animate-orbit-slow absolute inset-0 rounded-full border border-dashed border-[#E5E5E5] dark:border-white/15">
          <span className="absolute top-1/2 -translate-y-1/2 -right-[5px] w-[10px] h-[10px] rounded-full bg-lime animate-pulse-dot"></span>
          <span className="absolute top-1/2 -translate-y-1/2 -left-[5px] w-[10px] h-[10px] rounded-full bg-lime animate-pulse-dot"></span>
        </div>
      </div>
      {/* the core */}
      <div className="relative bg-navy-950 w-[200px] h-[200px] rounded-full flex flex-col items-center justify-center border border-white/10 shadow-[0_20px_60px_-15px_rgba(13,20,39,0.55)] dark:shadow-[0_0_70px_-15px_rgba(200,255,50,0.25)]">
        <span className="text-white text-[34px] font-bold tracking-[-1.8px] leading-none">
          ORQ8
        </span>
        <span className="mt-[12px] flex items-center gap-[7px]">
          <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
          <span className="text-[9px] font-semibold uppercase tracking-[2.4px] text-white/60">
            System online
          </span>
        </span>
      </div>
    </div>
  );
};

const Features: React.FC = () => {
  return (
    <>
      <div
        id="features"
        className="relative z-[1] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] scroll-mt-[100px]"
      >
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orange-400 mb-[10px] lg:mb-[15px]">
              What ORQ8 can do
            </span>
            <h2 className="!mb-0 !font-light !text-2xl md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px]">
              An operating system,{" "}
              <span className="text-primary-500">not a chatbot</span>
            </h2>
          </div>

          {/* Desktop: ORQ8 core with features orbiting around it */}
          <div className="hidden lg:block relative h-[720px] xl:h-[760px]">
            {/* connection lines from the core to each feature box */}
            <svg
              className="absolute inset-0 w-full h-full z-[1]"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              {features.map((f) => (
                <line
                  key={f.id}
                  x1="50"
                  y1="50"
                  x2={f.end[0]}
                  y2={f.end[1]}
                  stroke="rgba(96,93,255,0.30)"
                  strokeWidth="0.22"
                  className="orbit-connector"
                />
              ))}
            </svg>

            <Core />

            {features.map((f, i) => (
              <div key={f.id} className={`absolute ${f.pos} z-[2]`}>
                <div
                  className="feature-float"
                  style={
                    { "--float-delay": `${(i % 3) * 0.9}s` } as React.CSSProperties
                  }
                >
                  <div className="lift-card group w-[280px] xl:w-[300px] rounded-[16px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/15 shadow-sm dark:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.6)] px-[20px] py-[20px]">
                    <div className="flex items-center gap-[12px] mb-[12px]">
                      <div className="w-[42px] h-[42px] rounded-[12px] flex items-center justify-center flex-none bg-[#eef] dark:bg-white/10 transition-colors group-hover:bg-primary-500">
                        <i
                          className={`${f.icon} text-[22px] leading-none text-primary-500 transition-colors group-hover:text-white`}
                        ></i>
                      </div>
                      <h3 className="!mb-0 !font-semibold !text-[17px] -tracking-[0.3px]">
                        {f.title}
                      </h3>
                    </div>
                    <p className="!mb-0 text-[13.5px] xl:text-[14px] leading-relaxed text-gray-500 dark:text-gray-400">
                      {f.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile/tablet: compact core + card grid */}
          <div className="lg:hidden">
            <Core compact />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px]">
              {features.map((f) => (
                <div
                  key={f.id}
                  className="lift-card group rounded-[14px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/15 shadow-sm px-[18px] py-[18px]"
                >
                  <div className="flex items-center gap-[10px] mb-[8px]">
                    <div className="w-[36px] h-[36px] rounded-[10px] flex items-center justify-center flex-none bg-[#eef] dark:bg-white/10 transition-colors group-hover:bg-primary-500">
                      <i
                        className={`${f.icon} text-[18px] leading-none text-primary-500 transition-colors group-hover:text-white`}
                      ></i>
                    </div>
                    <h3 className="!mb-0 !font-semibold !text-[15px] -tracking-[0.2px]">
                      {f.title}
                    </h3>
                  </div>
                  <p className="!mb-0 text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
                    {f.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-lime blur-[302px] opacity-[0.6] dark:opacity-[0.12] rounded-[672px] w-[320px] md:w-[672px] h-[527px] absolute -z-[1] ltr:left-0 rtl:right-0 ltr:md:left-[10%] rtl:md:right-[10%] ltr:lg:left-[20%] rtl:lg:right-[20%] bottom-[50%] md:bottom-[10%]"></div>
        <div className="bg-primary-500 blur-[362px] opacity-[0.6] dark:opacity-[0.12] rounded-[556px] w-[320px] md:w-[556px] h-[466px] absolute -z-[1] ltr:right-0 rtl:left-0 ltr:md:right-[20%] rtl:md:left-[20%] bottom-[10%]"></div>
      </div>
    </>
  );
};

export default Features;
