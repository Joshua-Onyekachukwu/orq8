"use client";

import React from "react";
import Link from "next/link";

const About: React.FC = () => {
  return (
    <div className="py-24 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 lg:gap-20 items-center">
          {/* Content */}
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-emerald mb-4">
              About ORQ8
            </p>

            <h2 className="font-display text-4xl lg:text-5xl font-medium text-ink leading-tight tracking-tight mb-6">
              An organization that runs itself.{" "}
              <span className="text-emerald">Under your control.</span>
            </h2>

            <p className="text-lg text-ink-muted leading-relaxed mb-10">
              ORQ8 is the AI organization operating system. You set the direction.
              Your Executive Agent plans the work, hires the specialists, and
              reports back. You stay in command. Every consequential decision
              comes to you.
            </p>

            <div className="space-y-8">
              {[
                {
                  title: "Hire on demand",
                  description:
                    "No headcount, no interviews. When the work needs a researcher, a writer, or an engineer, ORQ8 hires them within your budget and releases them when the job is done.",
                },
                {
                  title: "Approvals you control",
                  description:
                    "Spend, publish, deploy. Anything consequential routes to you. Approve, reject, or modify in one tap. Everything else runs without interrupting you.",
                },
                {
                  title: "Budgets that hold",
                  description:
                    "Departments have allocations. Agents have limits. Nothing overspends without escalation, and every dollar is accounted for.",
                },
                {
                  title: "Everything audited",
                  description:
                    "Every decision, every action, every cost, time-stamped and immutable. Your company has a memory you can trust from day one.",
                },
              ].map((feature, index) => (
                <div key={index} className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-ink font-semibold text-lg mb-2">{feature.title}</h3>
                    <p className="text-ink-muted leading-relaxed">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href="/register"
              className="inline-flex items-center gap-2 mt-10 px-6 py-3 bg-emerald text-navy-950 font-semibold text-sm rounded-full hover:bg-emerald-dark transition-colors"
            >
              Start Free Trial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>

          {/* Visual — Clean image-based illustration instead of dark mockup */}
          <div className="relative">
            <div className="relative rounded-2xl overflow-hidden bg-canvas border border-hairline">
              {/* Product image placeholder — using a clean gradient + icon composition */}
              <div className="aspect-[4/3] flex flex-col items-center justify-center p-10">
                {/* Organization hierarchy visualization */}
                <div className="relative w-full max-w-[340px]">
                  {/* Founder node */}
                  <div className="flex justify-center mb-6">
                    <div className="flex items-center gap-3 px-5 py-3 bg-navy-950 rounded-xl shadow-lg">
                      <div className="w-8 h-8 rounded-lg bg-emerald flex items-center justify-center">
                        <svg className="w-4 h-4 text-navy-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold">You</p>
                        <p className="text-white/40 text-[10px] font-medium uppercase tracking-wider">Founder</p>
                      </div>
                    </div>
                  </div>

                  {/* Connector line */}
                  <div className="flex justify-center mb-4">
                    <div className="w-[1px] h-6 bg-hairline" />
                  </div>

                  {/* Executive Agent */}
                  <div className="flex justify-center mb-4">
                    <div className="flex items-center gap-3 px-5 py-3 bg-navy-950 rounded-xl shadow-lg border border-emerald/20">
                      <div className="w-8 h-8 rounded-lg bg-emerald/20 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold">Executive Agent</p>
                        <p className="text-white/40 text-[10px] font-medium uppercase tracking-wider">Plans & Coordinates</p>
                      </div>
                    </div>
                  </div>

                  {/* Connector lines to agents */}
                  <div className="flex justify-center gap-12 mb-4">
                    <div className="w-[1px] h-4 bg-hairline" />
                    <div className="w-[1px] h-4 bg-hairline" />
                    <div className="w-[1px] h-4 bg-hairline" />
                  </div>

                  {/* Agents row */}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { name: "Researcher", color: "bg-blue-500/10 text-blue-400" },
                      { name: "Writer", color: "bg-purple-500/10 text-purple-400" },
                      { name: "Engineer", color: "bg-amber-500/10 text-amber-400" },
                    ].map((agent) => (
                      <div key={agent.name} className="bg-navy-900 rounded-lg border border-white/[0.06] p-3 text-center">
                        <div className={`w-7 h-7 rounded-lg ${agent.color} flex items-center justify-center mx-auto mb-2`}>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                        <p className="text-white/80 text-[11px] font-medium">{agent.name}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -top-4 -right-4 bg-white rounded-xl border border-hairline px-4 py-3 shadow-lg">
              <p className="text-emerald text-xs font-semibold">+1 agent hired</p>
              <p className="text-ink-muted text-xs mt-0.5">Marketing specialist</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
