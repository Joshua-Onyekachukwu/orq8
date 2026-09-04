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
  Container is 800×740px. Center at (400, 370). Radius 280px.

  12 o'clock (0°):   x=400, y=370-280 = 90
  2 o'clock (60°):   x=400+280*sin(60)=400+242=642, y=370-280*cos(60)=370-140=230
  4 o'clock (120°):  x=400+242=642, y=370+140=510
  6 o'clock (180°):  x=400, y=370+280=650
  8 o'clock (240°):  x=400-242=158, y=510
  10 o'clock (300°): x=158, y=230
*/
const orbitalPositions = [
  { top: "90px",  left: "400px" },  // 12 — Executive Agent
  { top: "230px", left: "642px" },  // 2 — AI Workforce
  { top: "510px", left: "642px" },  // 4 — Approval Gates
  { top: "650px", left: "400px" },  // 6 — Goals & Tasks
  { top: "510px", left: "158px" },  // 8 — Company Memory
  { top: "230px", left: "158px" },  // 10 — Audit Trail
];

const Features: React.FC = () => {
  return (
    <div id="features" className="relative z-[1] bg-[#0a0a0b] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px] overflow-hidden">
      {/* Grid texture */}
      <div className="absolute inset-0 opacity-[0.03]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",backgroundSize:"60px 60px"}} />

      <div className="relative container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        {/* Header */}
        <div className="mb-[40px] md:mb-[50px] lg:mb-[70px] mx-auto text-center md:max-w-[495px] lg:max-w-[600px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-xs text-[#E86A33] mb-[10px] lg:mb-[15px]">Platform</span>
          <h2 className="!mb-[16px] !font-normal !text-2xl md:!text-4xl lg:!text-[42px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.76px] text-white">
            An operating system, not a chatbot
          </h2>
          <p className="text-white/50 md:text-[16px] !mb-0 max-w-[480px] mx-auto">
            Everything a company needs to operate — planned, coordinated, and executed by AI under your direction.
          </p>
        </div>

        {/* ── Orbital Layout (desktop) ── */}
        <div className="relative hidden lg:block mx-auto" style={{width:"800px", height:"740px"}}>
          {/* Orbital rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[260px] h-[260px] rounded-full border border-dashed border-[#B8FF66]/25" />
            <div className="absolute w-[440px] h-[440px] rounded-full border border-dashed border-[#E86A33]/15" />
            <div className="absolute w-[620px] h-[620px] rounded-full border border-dashed border-white/10" />
          </div>

          {/* Radial lines from core to each card */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 800 740">
            {orbitalPositions.map((pos, i) => (
              <line
                key={i}
                x1="400" y1="370"
                x2={pos.left.replace("px", "")}
                y2={pos.top.replace("px", "")}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
            ))}
          </svg>

          {/* Central core */}
          <div className="absolute top-[370px] left-[400px] -translate-x-1/2 -translate-y-1/2 z-[3]">
            <div className="w-[140px] h-[140px] rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-[0_0_60px_rgba(255,255,255,0.15)]">
              <div className="text-center">
                <span className="block text-[#0a0a0b] text-[24px] font-bold leading-none">ORQ8</span>
                <span className="block text-[#E86A33] text-[10px] uppercase tracking-[3px] mt-[6px] font-bold">Core</span>
              </div>
            </div>
            <div className="absolute inset-[-10px] rounded-full border border-[#B8FF66]/25 animate-ping" style={{animationDuration:"3s"}} />
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

        {/* ── Mobile/Tablet ── */}
        <div className="lg:hidden">
          <div className="flex justify-center mb-[30px]">
            <div className="w-[90px] h-[90px] rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)]">
              <div className="text-center">
                <span className="block text-[#0a0a0b] text-[18px] font-bold leading-none">ORQ8</span>
                <span className="block text-[#E86A33] text-[7px] uppercase tracking-[2px] mt-[3px] font-bold">Core</span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px]">
            {features.map((feature, index) => (
              <div key={index} className="group bg-white/[0.04] border border-white/[0.08] rounded-[14px] p-[24px] transition-all duration-300 hover:bg-white/[0.08] hover:border-[#B8FF66]/30 hover:shadow-[0_4px_20px_rgba(184,255,102,0.06)]">
                <div className="w-[44px] h-[44px] flex items-center justify-center rounded-[10px] bg-[#B8FF66]/10 text-[#B8FF66] mb-[16px] transition-all duration-300 group-hover:bg-[#B8FF66] group-hover:text-[#0a0a0b]">
                  <i className={`${feature.icon} text-[20px]`} />
                </div>
                <h3 className="!font-semibold !text-[16px] !text-white !mb-[8px] !leading-[1.3]">{feature.title}</h3>
                <p className="text-white/45 text-[13px] leading-[1.6] !mb-0">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#B8FF66]/[0.03] blur-[150px] pointer-events-none" />
    </div>
  );
};

function OrbitalCard({ feature }: { feature: (typeof features)[number] }) {
  return (
    <div className="group relative w-[240px] bg-white/[0.04] border border-white/[0.08] rounded-[14px] p-[22px] transition-all duration-300 hover:bg-white/[0.08] hover:border-[#B8FF66]/30 hover:shadow-[0_8px_30px_rgba(184,255,102,0.08)] hover:scale-[1.03]">
      <div className="w-[40px] h-[40px] flex items-center justify-center rounded-[10px] bg-[#B8FF66]/10 text-[#B8FF66] mb-[12px] transition-all duration-300 group-hover:bg-[#B8FF66] group-hover:text-[#0a0a0b] group-hover:scale-110">
        <i className={`${feature.icon} text-[18px]`} />
      </div>
      <h3 className="!font-semibold !text-[15px] !text-white !mb-[6px] !leading-[1.3]">{feature.title}</h3>
      <p className="text-white/45 text-[12px] leading-[1.6] !mb-0">{feature.description}</p>
    </div>
  );
}

export default Features;
