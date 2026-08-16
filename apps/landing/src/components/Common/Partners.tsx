"use client";

import React from "react";

// Brand logos the tool strip scrolls. The list is one full sequence; the
// track renders it twice so the -50% translate loops seamlessly. Remixicon
// brand icons keep this dependency-free.
const tools = [
  { name: "Slack", icon: "ri-slack-fill", color: "#611f69" },
  { name: "Gmail", icon: "ri-google-fill", color: "#4285F4" },
  { name: "GitHub", icon: "ri-github-fill", color: "#24292f" },
  { name: "Notion", icon: "ri-notion-line", color: "#000000" },
  { name: "Linear", icon: "ri-git-merge-line", color: "#5E6AD2" },
  { name: "Stripe", icon: "ri-stripe-line", color: "#635bff" },
  { name: "Zapier", icon: "ri-zapier-line", color: "#FF4F00" },
  { name: "Drive", icon: "ri-google-drive-line", color: "#00AC47" },
];

// Two full copies of the sequence for a seamless loop.
const trackItems = [...tools, ...tools];

const Partners: React.FC = () => {
  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <p className="text-center uppercase font-bold tracking-[1.8px] text-xs text-gray-400 mb-[35px] md:mb-[45px]">
            Plugs into the tools you already run
          </p>
        </div>

        {/* Infinite right-to-left marquee. The track is duplicated so the loop
            never jumps; reduced-motion users get a static row. */}
        <div
          className="logo-marquee relative overflow-hidden"
          role="presentation"
        >
          <div className="logo-marquee-track flex items-center gap-[40px] md:gap-[64px] w-max">
            {trackItems.map((tool, i) => (
              <div
                key={`${tool.name}-${i}`}
                className="flex items-center gap-[10px] text-gray-300 transition-colors hover:text-primary-500 whitespace-nowrap"
              >
                <i
                  className={`${tool.icon} text-[26px] md:text-[30px] leading-none`}
                  style={{ color: tool.color }}
                  aria-hidden="true"
                ></i>
                <span className="text-[20px] lg:text-[24px] font-light -tracking-[0.6px]">
                  {tool.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Partners;
