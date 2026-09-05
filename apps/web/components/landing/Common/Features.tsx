"use client";

import React from "react";

const features = [
  { icon: "ri-flashlight-line", title: "Executive Agent", description: "Plans the work, hires specialists, coordinates execution." },
  { icon: "ri-team-line", title: "AI Workforce", description: "Specialized employees with defined roles and budgets." },
  { icon: "ri-shield-check-line", title: "Approval Gates", description: "AI proposes. You decide. Every consequential action." },
  { icon: "ri-checkbox-circle-line", title: "Goals & Tasks", description: "Set direction in plain language. Track progress automatically." },
  { icon: "ri-database-2-line", title: "Company Memory", description: "Every decision accumulates. Your company gets smarter." },
  { icon: "ri-file-list-3-line", title: "Audit Trail", description: "Every action, every dollar. Time-stamped and immutable." },
];

/*
  Clockwise from 12 o'clock, 60° apart.
  Container: 1000×900px. Center: (500, 450). Radius: 380px.

  12 o'clock (0°):   x=500, y=450-380 = 70
  2 o'clock (60°):   x=500+380*sin(60)=500+329=829, y=450-380*cos(60)=450-190=260
  4 o'clock (120°):  x=829, y=450+190=640
  6 o'clock (180°):  x=500, y=450+380=830
  8 o'clock (240°):  x=500-329=171, y=640
  10 o'clock (300°): x=171, y=260
*/
const orbitalPositions = [
  { top: "70px",  left: "500px" },  // 12 — Executive Agent
  { top: "260px", left: "829px" },  // 2 — AI Workforce
  { top: "640px", left: "829px" },  // 4 — Approval Gates
  { top: "830px", left: "500px" },  // 6 — Goals & Tasks
  { top: "640px", left: "171px" },  // 8 — Company Memory
  { top: "260px", left: "171px" },  // 10 — Audit Trail
];

const Features: React.FC = () => {
  return (
    <div id="features" className="relative z-[1] bg-orq8-dark py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] overflow-hidden">
      {/* Grid texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",backgroundSize:"60px 60px"}} />

      <div className="relative container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        {/* Header */}
        <div className="mb-[40px] md:mb-[50px] lg:mb-[70px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-orq8-orange-bright mb-[10px] lg:mb-[15px]">Platform</span>
          <h2 className="!mb-[16px] !font-normal !text-2xl md:!text-4xl lg:!text-[42px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px] text-white">
            An operating system, not a chatbot
          </h2>
          <p className="text-white/50 md:text-base !mb-0 max-w-[480px] mx-auto">
            Everything a company needs to operate — planned, coordinated, and executed by AI under your direction.
          </p>
        </div>

        {/* ── Orbital Layout (desktop) ── */}
        <div className="relative hidden lg:block mx-auto" style={{width:"1000px", height:"900px"}}>
          {/* Orbital rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[340px] h-[340px] rounded-full border border-dashed border-orq8-lime/25" />
            <div className="absolute w-[560px] h-[560px] rounded-full border border-dashed border-orq8-orange/15" />
            <div className="absolute w-[760px] h-[760px] rounded-full border border-dashed border-white/10" />
          </div>

          {/* Radial lines from core to each card */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 900">
            {orbitalPositions.map((pos, i) => (
              <line
                key={i}
                x1="500" y1="450"
                x2={pos.left.replace("px", "")}
                y2={pos.top.replace("px", "")}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            ))}
          </svg>

          {/* Central core */}
          <div className="absolute top-[450px] left-[500px] -translate-x-1/2 -translate-y-1/2 z-[3]">
            <div className="w-[140px] h-[140px] rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-[0_0_60px_rgba(255,255,255,0.15)]">
              <div className="text-center">
                <span className="block text-orq8-dark text-[24px] font-bold leading-none">ORQ8</span>
                <span className="block text-orq8-orange-bright text-3xs uppercase tracking-[3px] mt-[6px] font-bold">Core</span>
              </div>
            </div>
            <div className="absolute inset-[-10px] rounded-full border border-orq8-lime/25 animate-ping" style={{animationDuration:"3s"}} />
          </div>

          {/* 6 cards — clockwise from 12 o'clock */}
          {features.map((feature, i) => {
            const pos = orbitalPositions[i]!;
            return (
              <div
                key={i}
                className="absolute z-[2]"
                style={{
                  top: pos.top,
                  left: pos.left,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <OrbitalCard feature={feature} />
              </div>
            );
          })}
        </div>

        {/* ── Mobile: single column ── */}
        <div className="md:hidden grid grid-cols-1 gap-[16px]">
          {features.map((feature, index) => (
            <div key={index} className="group bg-white/[0.04] border border-white/[0.08] rounded-[14px] p-[24px] transition-all duration-300 hover:bg-white/[0.08] hover:border-orq8-lime/30">
              <div className="w-[44px] h-[44px] flex items-center justify-center rounded-[10px] bg-orq8-lime/10 text-orq8-lime mb-[16px] transition-all duration-300 group-hover:bg-orq8-lime group-hover:text-orq8-dark">
                <i className={`${feature.icon} text-xl`} />
              </div>
              <h3 className="!font-semibold !text-base !text-white !mb-[8px] !leading-[1.3]">{feature.title}</h3>
              <p className="text-white/45 text-2sm leading-[1.6] !mb-0">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* ── Tablet: 2-column grid ── */}
        <div className="hidden md:grid lg:hidden grid-cols-2 gap-[20px]">
          {features.map((feature, index) => (
            <div key={index} className="group bg-white/[0.04] border border-white/[0.08] rounded-[14px] p-[24px] transition-all duration-300 hover:bg-white/[0.08] hover:border-orq8-lime/30 hover:shadow-[0_4px_20px_rgba(184,255,102,0.06)]">
              <div className="w-[44px] h-[44px] flex items-center justify-center rounded-[10px] bg-orq8-lime/10 text-orq8-lime mb-[16px] transition-all duration-300 group-hover:bg-orq8-lime group-hover:text-orq8-dark">
                <i className={`${feature.icon} text-xl`} />
              </div>
              <h3 className="!font-semibold !text-base !text-white !mb-[8px] !leading-[1.3]">{feature.title}</h3>
              <p className="text-white/45 text-2sm leading-[1.6] !mb-0">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-orq8-lime/[0.03] blur-[150px] pointer-events-none" />
    </div>
  );
};

function OrbitalCard({ feature }: { feature: (typeof features)[number] }) {
  return (
    <div className="group relative w-[240px] bg-white/[0.04] border border-white/[0.08] rounded-[14px] p-[22px] transition-all duration-300 hover:bg-white/[0.08] hover:border-orq8-lime/30 hover:shadow-[0_8px_30px_rgba(184,255,102,0.08)] hover:scale-[1.03]">
      <div className="w-[40px] h-[40px] flex items-center justify-center rounded-[10px] bg-orq8-lime/10 text-orq8-lime mb-[12px] transition-all duration-300 group-hover:bg-orq8-lime group-hover:text-orq8-dark group-hover:scale-110">
        <i className={`${feature.icon} text-lg`} />
      </div>
      <h3 className="!font-semibold !text-md !text-white !mb-[6px] !leading-[1.3]">{feature.title}</h3>
      <p className="text-white/45 text-xs leading-[1.6] !mb-0">{feature.description}</p>
    </div>
  );
}

export default Features;
