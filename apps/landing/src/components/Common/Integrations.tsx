"use client";

import React from "react";

/* Looping integration showcase: two rows of tool tiles scrolling in opposite
   directions around an ORQ8 hub divider. Real remixicon brand glyphs where the
   icon set has them; clean brand-letter monograms for the rest. Each row is one
   full sequence rendered twice so the -50% loop is seamless; edge fades and a
   reduced-motion fallback come from globals.css. */

interface IntegrationTool {
  name: string;
  color: string;
  icon?: string; // remixicon class when available
  letter?: string; // monogram fallback
}

const rowA: IntegrationTool[] = [
  { name: "GitHub", color: "#24292f", icon: "ri-github-fill" },
  { name: "Slack", color: "#611f69", icon: "ri-slack-fill" },
  { name: "Figma", color: "#F24E1E", icon: "ri-figma-fill" },
  { name: "Notion", color: "#000000", icon: "ri-notion-line" },
  { name: "Linear", color: "#5E6AD2", letter: "L" },
  { name: "Stripe", color: "#635bff", letter: "S" },
  { name: "Zapier", color: "#FF4F00", letter: "Z" },
  { name: "Gmail", color: "#4285F4", icon: "ri-google-fill" },
  { name: "Drive", color: "#00AC47", letter: "D" },
];

const rowB: IntegrationTool[] = [
  { name: "Discord", color: "#5865F2", icon: "ri-discord-fill" },
  { name: "Dropbox", color: "#0061FF", icon: "ri-dropbox-fill" },
  { name: "Jira", color: "#0052CC", letter: "J" },
  { name: "Asana", color: "#F06A6A", letter: "A" },
  { name: "Airtable", color: "#FCB400", letter: "A" },
  { name: "HubSpot", color: "#FF7A59", letter: "H" },
  { name: "Intercom", color: "#1F8DED", letter: "I" },
  { name: "Zoom", color: "#2D8CFF", letter: "Z" },
  { name: "Trello", color: "#0079BF", letter: "T" },
];

const ToolTile: React.FC<{ tool: IntegrationTool }> = ({ tool }) => {
  return (
    <div className="flex items-center gap-[12px] rounded-[14px] bg-white dark:bg-navy-900 border border-gray-100 dark:border-white/15 px-[16px] py-[11px] shadow-sm hover:shadow-md transition-shadow">
      <span
        className="w-[40px] h-[40px] rounded-[10px] flex items-center justify-center text-[20px] flex-none"
        style={{ backgroundColor: `${tool.color}1A` }}
      >
        {tool.icon ? (
          <i
            className={`${tool.icon} text-[20px] leading-none`}
            style={{ color: tool.color }}
            aria-hidden="true"
          ></i>
        ) : (
          <span
            className="text-[16px] font-bold leading-none"
            style={{ color: tool.color }}
            aria-hidden="true"
          >
            {tool.letter}
          </span>
        )}
      </span>
      <span className="text-[15px] font-medium text-navy-950 dark:text-white whitespace-nowrap -tracking-[0.2px]">
        {tool.name}
      </span>
    </div>
  );
};

const Integrations: React.FC = () => {
  return (
    <>
      <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center lg:max-w-[781px]">
            <span className="block uppercase font-bold tracking-[1.8px] text-[11px] md:text-xs text-primary-500 mb-[8px] md:mb-[10px] lg:mb-[12px]">
              INTEGRATIONS
            </span>
            <h2 className="!mb-0 !text-[26px] md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[1.5px] lg:-tracking-[2.3px]">
              One organization,{" "}
              <span className="text-primary-500">connected to your stack</span>
            </h2>
            <p className="max-w-[520px] mx-auto mt-[12px] md:mt-[16px] text-gray-500 dark:text-gray-400">
              The tools you already use plug straight in. Same approvals, same
              budgets, same audit trail across all of them.
            </p>
          </div>
        </div>

        {/* Row 1: scrolls left */}
        <div
          className="integrations-marquee relative overflow-hidden py-[6px]"
          role="presentation"
        >
          <div className="integrations-marquee-track flex items-center gap-[16px] md:gap-[20px] w-max">
            {[...rowA, ...rowA].map((tool, i) => (
              <ToolTile key={`${tool.name}-${i}`} tool={tool} />
            ))}
          </div>
        </div>

        {/* ORQ8 hub divider between the two streams */}
        <div className="flex items-center justify-center gap-[16px] md:gap-[22px] my-[26px] md:my-[34px] px-[20px]">
          <span
            aria-hidden
            className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-gray-200 dark:to-white/10"
          ></span>
          <span className="flex items-center gap-[10px]">
            <span className="text-navy-950 dark:text-white font-bold tracking-[-0.6px] text-lg leading-none">
              ORQ8
            </span>
            <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot"></span>
            <span className="text-[10px] font-semibold uppercase tracking-[2.2px] text-gray-400">
              System online
            </span>
          </span>
          <span
            aria-hidden
            className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-gray-200 dark:to-white/10"
          ></span>
        </div>

        {/* Row 2: scrolls right */}
        <div
          className="integrations-marquee relative overflow-hidden py-[6px]"
          role="presentation"
        >
          <div className="integrations-marquee-track marquee-reverse flex items-center gap-[16px] md:gap-[20px] w-max">
            {[...rowB, ...rowB].map((tool, i) => (
              <ToolTile key={`${tool.name}-${i}`} tool={tool} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

export default Integrations;
