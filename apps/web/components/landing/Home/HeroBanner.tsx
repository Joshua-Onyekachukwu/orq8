"use client";

import React from "react";
import Link from "next/link";

const HeroBanner: React.FC = () => {
  return (
    <div className="relative min-h-screen bg-navy-950 overflow-hidden">
      {/* Subtle grid pattern — precision, not decoration */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 pt-32 pb-20 lg:pt-40 lg:pb-32">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Left — Headline, copy, CTA */}
          <div className="max-w-xl">
            {/* Eyebrow — mono, tracked, purposeful */}
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald mb-6">
              AI Organization Operating System
            </p>

            {/* Headline — Strong, specific, confident */}
            <h1 className="font-display text-5xl lg:text-6xl xl:text-7xl font-medium text-white leading-[1.05] tracking-tight mb-6">
              Run a company{" "}
              <span className="text-emerald">of one</span>
            </h1>

            {/* Supporting copy — Clear, specific, no buzzwords */}
            <p className="text-lg lg:text-xl text-slate-400 leading-relaxed mb-10 max-w-lg">
              You set the direction. ORQ8 hires the AI team, does the work,
              and reports back under your approvals and your budget.
            </p>

            {/* Primary CTA */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald text-navy-950 font-semibold text-sm tracking-wide rounded-full hover:bg-emerald-light transition-colors"
              >
                Start Free Trial
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 text-white/80 font-medium text-sm tracking-wide rounded-full border border-white/20 hover:border-white/40 hover:text-white transition-colors"
              >
                Learn More
              </Link>
            </div>

            {/* Trust signal — Real, not fake */}
            <p className="mt-8 text-sm text-slate-500">
              7-day free trial · No credit card required · Cancel anytime
            </p>
          </div>

          {/* Right — Product visualization */}
          <div className="relative lg:h-[600px]">
            {/* Product mockup — Real ORQ8 UI */}
            <div className="relative bg-navy-900 rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <div className="w-3 h-3 rounded-full bg-green-500/80" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-white/5 rounded-md px-3 py-1.5 text-xs text-white/40 font-mono">
                    app.orq8.ai
                  </div>
                </div>
              </div>

              {/* Dashboard content */}
              <div className="p-6 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-medium text-sm">Executive Dashboard</h3>
                    <p className="text-white/40 text-xs mt-0.5">3 agents active · 12 tasks today</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 px-2 py-1 bg-emerald/10 text-emerald text-xs font-medium rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald rounded-full animate-pulse" />
                      Live
                    </span>
                  </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Active Agents", value: "3", change: "+1 today" },
                    { label: "Tasks Completed", value: "12", change: "86% success" },
                    { label: "Credits Used", value: "247", change: "of 1,000" },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-white/5 rounded-lg p-3">
                      <p className="text-white/40 text-xs">{stat.label}</p>
                      <p className="text-white text-xl font-semibold mt-1">{stat.value}</p>
                      <p className="text-emerald text-xs mt-0.5">{stat.change}</p>
                    </div>
                  ))}
                </div>

                {/* Agent activity */}
                <div className="bg-white/5 rounded-lg p-4">
                  <p className="text-white/60 text-xs font-medium uppercase tracking-wider mb-3">
                    Agent Activity
                  </p>
                  <div className="space-y-2">
                    {[
                      { name: "Researcher", task: "Analyzing market data", status: "active" },
                      { name: "Writer", task: "Drafting launch post", status: "active" },
                      { name: "Engineer", task: "Reviewing PR #142", status: "idle" },
                    ].map((agent) => (
                      <div key={agent.name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${agent.status === "active" ? "bg-emerald" : "bg-white/20"}`} />
                          <span className="text-white text-sm">{agent.name}</span>
                        </div>
                        <span className="text-white/40 text-xs">{agent.task}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Approval pending */}
                <div className="bg-amber/10 border border-amber/20 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-amber/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white text-sm font-medium">Marketing requests $250</p>
                        <p className="text-white/40 text-xs">Within budget · Needs approval</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1.5 bg-emerald text-navy-950 text-xs font-semibold rounded-full">
                        Approve
                      </button>
                      <button className="px-3 py-1.5 border border-white/20 text-white/60 text-xs rounded-full">
                        Review
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating elements — subtle, purposeful */}
            <div className="absolute -top-4 -right-4 bg-navy-800 border border-white/10 rounded-xl px-4 py-3 shadow-xl">
              <p className="text-emerald text-xs font-semibold">+1 agent hired</p>
              <p className="text-white/40 text-xs mt-0.5">Marketing specialist</p>
            </div>

            <div className="absolute -bottom-4 -left-4 bg-navy-800 border border-white/10 rounded-xl px-4 py-3 shadow-xl">
              <p className="text-white text-xs font-medium">Audit Trail</p>
              <p className="text-white/40 text-xs mt-0.5">Writer published · 2 min ago</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroBanner;
