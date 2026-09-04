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
              className="inline-flex items-center gap-2 mt-10 px-6 py-3 bg-emerald text-navy-950 font-semibold text-sm rounded-full hover:bg-emerald-light transition-colors"
            >
              Start Free Trial
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>

          {/* Visual — Product mockup */}
          <div className="relative">
            <div className="relative bg-navy-950 rounded-2xl border border-white/10 p-6 shadow-2xl">
              {/* Decision card */}
              <div className="bg-navy-900 rounded-xl border border-white/10 p-5">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                    Decision Center
                  </span>
                  <span className="text-xs font-semibold text-emerald">Awaiting you</span>
                </div>

                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-emerald/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-white text-sm">
                      Marketing requests <span className="text-emerald font-semibold">$250</span> for a launch campaign
                    </p>
                    <p className="text-white/40 text-xs mt-1">Within budget · Needs your approval</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 py-2 bg-emerald text-navy-950 text-xs font-semibold rounded-full">
                    Approve
                  </button>
                  <button className="flex-1 py-2 border border-white/20 text-white/60 text-xs rounded-full">
                    Modify
                  </button>
                  <button className="flex-1 py-2 border border-white/20 text-white/60 text-xs rounded-full">
                    Reject
                  </button>
                </div>
              </div>

              {/* Agents working */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-navy-900 rounded-lg border border-white/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
                    Active now
                  </p>
                  {["Researcher", "Writer", "Engineer"].map((agent) => (
                    <div key={agent} className="flex items-center gap-2 py-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald" />
                      <span className="text-xs text-white/80">{agent}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-navy-900 rounded-lg border border-white/10 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-2">
                    Weekly cost
                  </p>
                  <p className="text-2xl font-light text-white">$14.20</p>
                  <p className="text-xs text-emerald font-medium mt-1">Within budget</p>
                </div>
              </div>

              {/* Audit trail */}
              <div className="mt-4 bg-navy-900 rounded-lg border border-white/10 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-emerald" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-white/60">Writer published launch post · 2 min ago</span>
                </div>
                <span className="text-xs text-white/40 font-medium">Audited</span>
              </div>
            </div>

            {/* Floating badge */}
            <div className="absolute -top-4 -right-4 bg-white rounded-xl border border-hairline px-4 py-3 shadow-lg">
              <p className="text-emerald text-xs font-semibold">+1 agent hired</p>
              <p className="text-ink-muted text-xs mt-0.5">Marketing specialist · this week</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;
