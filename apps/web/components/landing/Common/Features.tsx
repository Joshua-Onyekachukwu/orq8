"use client";

import React from "react";

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    title: "AI Employees",
    description: "Build a team of specialized AI employees with defined roles, budgets, and authority. They execute together.",
    stat: "Build teams",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: "Command Center",
    description: "Live state of your organization. Active agents, tasks, costs — executive visibility without the noise.",
    stat: "Full visibility",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Approval Gates",
    description: "AI proposes. You decide. Consequential actions route to you. Approve, reject, or modify in one tap.",
    stat: "You decide",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    title: "Goals & Tasks",
    description: "Set the direction. Watch it execute. Define goals in plain language. The system breaks them into tasks and tracks progress.",
    stat: "Plain language",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    title: "Company Memory",
    description: "Decisions that compound over time. Every decision, lesson, and outcome accumulates. Your company gets smarter.",
    stat: "Compounds over time",
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: "Audit Trail",
    description: "Every action, every dollar, tracked. Time-stamped and immutable. Your company has a complete operational record.",
    stat: "Immutable",
  },
];

const Features: React.FC = () => {
  return (
    <div id="features" className="py-24 lg:py-32 bg-canvas">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header — strong typography, clear hierarchy */}
        <div className="text-center max-w-2xl mx-auto mb-16 lg:mb-20">
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald mb-4">
            Platform
          </p>
          <h2 className="font-display text-4xl lg:text-5xl font-medium text-ink leading-tight tracking-tight mb-6">
            An operating system, not a chatbot
          </h2>
          <p className="text-lg text-ink-muted leading-relaxed">
            Six capabilities orbiting one central intelligence. Each designed
            for founders who need real work done, not another AI demo.
          </p>
        </div>

        {/* Feature grid — 2x3 with stronger visual presence */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="group bg-surface rounded-2xl border border-hairline p-7 lg:p-8 hover:border-emerald/30 hover:shadow-lg transition-all duration-300 relative overflow-hidden"
            >
              {/* Subtle accent line at top on hover */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-emerald/0 group-hover:bg-emerald transition-colors duration-300" />

              <div className="flex items-start justify-between mb-5">
                <div className="w-12 h-12 rounded-xl bg-emerald/10 flex items-center justify-center text-emerald group-hover:bg-emerald group-hover:text-white transition-colors duration-300">
                  {feature.icon}
                </div>
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-faint opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  {feature.stat}
                </span>
              </div>
              <h3 className="text-ink font-semibold text-lg mb-3">{feature.title}</h3>
              <p className="text-ink-muted leading-relaxed text-[15px]">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Features;
