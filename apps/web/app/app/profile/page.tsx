"use client";

import { useState } from "react";
import Image from "next/image";
import { CheckCircle2, Edit, Mail, MapPin, Phone, Share2, Sparkles } from "lucide-react";

/**
 * My Profile, adapted from the Trezo user-profile base: a cover card with
 * avatar and actions, section tabs (Overview / Details / Projects), an
 * About card, an agent roster card, and a projects table.
 */
const agents = [
  { name: "Researcher · α", role: "Market researcher", status: "Working", image: null as string | null },
  { name: "Writer · α", role: "Content writer", status: "Working", image: null as string | null },
  { name: "Engineer · α", role: "Software engineer", status: "Working", image: null as string | null },
  { name: "Analyst · α", role: "Operations analyst", status: "Paused", image: null as string | null },
];

const projects = [
  { name: "Launch campaign", dept: "Marketing", status: "In progress", progress: 62 },
  { name: "Pricing page v2", dept: "Engineering", status: "In review", progress: 88 },
  { name: "Onboarding email flow", dept: "Marketing", status: "In progress", progress: 34 },
  { name: "Support tooling eval", dept: "Operations", status: "Planned", progress: 8 },
];

const details = [
  { k: "Email", v: "founder@orq8.io", icon: Mail },
  { k: "Phone", v: "+1 555 010 2030", icon: Phone },
  { k: "Location", v: "Lagos, Nigeria", icon: MapPin },
  { k: "Company", v: "ORQ8 Labs · Company of One", icon: CheckCircle2 },
];

const tabs = ["Overview", "Details", "Projects"] as const;
type Tab = (typeof tabs)[number];

export default function ProfilePage() {
  const [active, setActive] = useState<Tab>("Overview");

  return (
    <div className="mx-auto max-w-5xl">
      {/* Cover card */}
      <div className="overflow-hidden rounded-xl border border-hairline bg-white">
        <div className="relative h-36 bg-navy-950 sm:h-44">
          <div
            aria-hidden
            className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]"
          />
          <div
            aria-hidden
            className="absolute -top-20 right-10 h-56 w-56 rounded-full bg-emerald/20 blur-[80px]"
          />
          <div
            aria-hidden
            className="absolute bottom-4 left-6 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50"
          >
            Company of One · Command Center
          </div>
        </div>

        <div className="px-6 pb-6 pt-0 sm:px-8">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
            <div className="flex items-end gap-4">
              <span className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-white shadow-lg sm:h-24 sm:w-24">
                <Image
                  src="/images/members/member-1.jpg"
                  width={96}
                  height={96}
                  alt="Joshua O."
                  className="h-full w-full object-cover"
                />
              </span>
              <div className="pb-1">
                <p className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink sm:text-xl">
                  Joshua O.
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lime text-navy-950" title="Verified founder">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                </p>
                <p className="text-sm text-muted">Founder &amp; CEO · ORQ8 Labs</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-navy-800"
              >
                <Edit className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full bg-navy-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950"
              >
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
            </div>
          </div>

          {/* Tabs */}
          <nav aria-label="Profile sections" className="mt-6 border-t border-hairline pt-4">
            <ul className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <li key={tab}>
                  <button
                    type="button"
                    onClick={() => setActive(tab)}
                    aria-current={active === tab ? "page" : undefined}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      active === tab
                        ? "bg-navy-900 text-white"
                        : "text-navy-800 hover:bg-canvas"
                    }`}
                  >
                    {tab}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {active === "Overview" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* About */}
          <section className="rounded-xl border border-hairline bg-white p-6 lg:col-span-2">
            <h2 className="text-sm font-semibold text-ink">About me</h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
              <p>
                I run ORQ8 as a Company of One. The system is my operating
                system: it hires the agents, does the work, and reports back
                under my approvals and my budget.
              </p>
              <p>
                My job is direction. Every week the Executive Agent summarizes
                what happened, what it cost, and what is next, so I spend my
                time deciding instead of managing.
              </p>
              <p className="flex items-start gap-2 rounded-lg bg-canvas p-3 text-ink">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-emerald" aria-hidden />
                <span>
                  <span className="font-semibold">How I run the company:</span>{" "}
                  set the goal, approve the plan, review the results. Everything
                  else is delegated to agents with budgets.
                </span>
              </p>
            </div>
          </section>

          {/* Agents */}
          <section className="rounded-xl border border-hairline bg-white p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">My agents</h2>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
                3 working
              </span>
            </div>
            <ul className="mt-4 divide-y divide-hairline">
              {agents.map((a) => (
                <li key={a.name} className="flex items-center gap-3 py-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-emerald">
                    {a.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                    <p className="truncate text-xs text-muted">{a.role}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                      a.status === "Working"
                        ? "bg-emerald/15 text-emerald-700"
                        : "bg-canvas text-muted"
                    }`}
                  >
                    {a.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {active === "Details" && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {details.map((d) => (
            <div key={d.k} className="flex items-center gap-4 rounded-xl border border-hairline bg-white p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-emerald">
                <d.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                  {d.k}
                </p>
                <p className="truncate text-sm font-medium text-ink">{d.v}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {active === "Projects" && (
        <section className="mt-6 rounded-xl border border-hairline bg-white">
          <div className="border-b border-hairline px-5 py-4">
            <h2 className="text-sm font-semibold text-ink">Projects</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas text-left">
                  {["Project", "Department", "Status", "Progress"].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {projects.map((p) => (
                  <tr key={p.name}>
                    <td className="px-5 py-3.5 text-sm font-medium text-ink">{p.name}</td>
                    <td className="px-5 py-3.5 text-sm text-muted">{p.dept}</td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-wide ${
                          p.status === "In review"
                            ? "bg-amber-50 text-amber-700"
                            : p.status === "In progress"
                              ? "bg-emerald/15 text-emerald-700"
                              : "bg-canvas text-muted"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-canvas">
                          <div className="h-full rounded-full bg-emerald" style={{ width: `${p.progress}%` }} />
                        </div>
                        <span className="font-mono text-xs tabular-nums text-muted">{p.progress}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
