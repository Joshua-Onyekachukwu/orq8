"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { Button } from "../../components/button";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

type Billing = "monthly" | "annual";

type Plan = {
  name: string;
  price: { monthly: string; annual: string };
  note: { monthly: string; annual: string };
  blurb: string;
  features: { lead?: string; text: string }[];
  cta: string;
  ctaVariant: "default" | "outline" | "outline-light";
  featured?: boolean;
};

const plans: Plan[] = [
  {
    name: "Free",
    price: { monthly: "$0", annual: "$0" },
    note: { monthly: "free forever", annual: "free forever" },
    blurb: "For trying it on one idea.",
    features: [
      { text: "1 organization · 3 AI employees" },
      { text: "1 department" },
      { text: "Free/local models included (Ollama + free tiers)" },
      { text: "Weekly executive report" },
      { text: "Company Constitution + audit trail" },
      { text: "One integration" },
    ],
    cta: "Start free — no card required",
    ctaVariant: "outline",
  },
  {
    name: "Pro",
    price: { monthly: "$49/mo", annual: "$39/mo" },
    note: {
      monthly: "or $39/mo billed annually",
      annual: "billed annually — save 20%",
    },
    blurb: "For the solo founder who wants their whole operation run.",
    featured: true,
    features: [
      { lead: "10 AI employees", text: " — hire per business case, not per headcount tax" },
      { text: "Unlimited departments, teams, and temporary project teams" },
      {
        lead: "Bring Your Own Key",
        text: " — route work across OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter (or stay on free/local models)",
      },
      { text: "Full governance: approval tiers, spending authority, emergency controls" },
      { text: "CEO Decision Center — approve or reject with full context, not notification noise" },
      { text: "Councils & debate: get adversarial, evidence-backed recommendations" },
      { text: "Simulation — forecast workforce, workload, and cost before you commit" },
      { text: "Weekly executive report + cost tracking by department, project, and agent" },
    ],
    cta: "Get Pro",
    ctaVariant: "outline-light",
  },
  {
    name: "Business",
    price: { monthly: "$199/mo", annual: "$159/mo" },
    note: {
      monthly: "or $159/mo billed annually",
      annual: "billed annually — save 20%",
    },
    blurb: "For growing companies with real operations.",
    features: [
      { lead: "50 AI employees", text: "" },
      { text: "Everything in Pro" },
      { lead: "Advanced governance + audit exports", text: " (compliance-ready)" },
      { text: "Integrations: GitHub, email, project management, calendar" },
      { text: "Monthly executive report with org health" },
      { text: "Priority support" },
      { text: "SSO (coming soon)" },
    ],
    cta: "Get Business",
    ctaVariant: "outline",
  },
  {
    name: "Enterprise",
    price: { monthly: "Custom", annual: "Custom" },
    note: { monthly: "private deployment · SLA", annual: "private deployment · SLA" },
    blurb: "For large AI workforces and regulated environments.",
    features: [
      { lead: "Unlimited AI employees", text: "" },
      { lead: "Private deployment", text: " (self-hosted or VPC)" },
      { text: "Custom integrations and internal-tool platform" },
      { text: "SLA + dedicated onboarding" },
      { text: "Enterprise governance: SSO, advanced audit, compliance reporting" },
      { text: "Usage-based options for AI/voice/infrastructure" },
    ],
    cta: "Talk to sales",
    ctaVariant: "outline",
  },
];

const everyPlan = [
  {
    lead: "Governance in code, not prompts.",
    text: "Company Constitution, approval tiers, forbidden actions — enforced server-side.",
  },
  {
    lead: "CEO attention protection.",
    text: "A Decision Center, weekly briefings, and a monthly report — instead of an agent zoo.",
  },
  {
    lead: "Company memory.",
    text: "Decisions, lessons, and precedents persist — your organization gets smarter over time.",
  },
  {
    lead: "Model-agnostic.",
    text: "Use free local models or your own keys. No lock-in, no model markup.",
  },
  {
    lead: "Everything audited.",
    text: "Every significant action, approval, and dollar tracked — tamper-evident.",
  },
  {
    lead: "No commissions.",
    text: "One platform price for the whole organization. We don't take cuts on your AI employees, and we don't run an agent marketplace (ADR-021).",
  },
];

const pricingSteps = [
  {
    title: "Platform fee",
    text: "Covers the operating system: governance, orchestration, memory, reporting, approvals, and audit. Billed monthly or annually. That's your only ORQ8 bill.",
  },
  {
    title: "Model usage — your choice",
    text: "Free path: local models (Ollama) and free tiers — $0 model cost. BYOK path: connect your own provider keys; you pay the provider directly at their rates. No markup, no hidden margin.",
  },
  {
    title: "Capacity scales with your org",
    text: "Upgrade tiers as you hire more AI employees or need audit/enterprise features. Prorated, cancel anytime.",
  },
];

const comparison = [
  ["AI employees", "3", "10", "50", "Unlimited"],
  ["Departments / teams", "1 dept", "Unlimited", "Unlimited", "Unlimited"],
  ["Free/local models", "✓", "✓", "✓", "✓"],
  ["Bring Your Own Key", "—", "✓", "✓", "✓"],
  ["Constitution + governance", "✓", "✓", "✓", "✓"],
  ["Approval tiers + Decision Center", "✓", "✓", "✓", "✓"],
  ["Councils & debate", "—", "✓", "✓", "✓"],
  ["Simulation", "—", "✓", "✓", "✓"],
  ["Company memory & precedents", "✓", "✓", "✓", "✓"],
  ["Weekly report", "✓", "✓", "✓", "✓"],
  ["Monthly report + org health", "—", "—", "✓", "✓"],
  ["Audit exports", "—", "—", "✓", "✓"],
  ["Integrations (GitHub, email, PM)", "1", "—", "✓", "✓"],
  ["SSO", "—", "—", "Coming soon", "✓"],
  ["Priority support", "—", "—", "✓", "✓"],
  ["Private deployment", "—", "—", "—", "✓"],
  ["SLA + dedicated onboarding", "—", "—", "—", "✓"],
] as const;

const faqs = [
  {
    q: "Do I need my own API keys?",
    a: "No. You can run entirely on free/local models. Add your own keys when you want frontier models — you pay the provider directly, we never mark up.",
  },
  {
    q: "Is there a per-agent fee?",
    a: "No. A plan covers your AI employees up to the tier's capacity. No seat tax, no commissions, no marketplace cuts.",
  },
  {
    q: "What counts as an \u201CAI employee\u201D?",
    a: "Any hired agent — full-time or temporary (project teams archive after the project). Archive and rehire as work demands; capacity limits apply to active employees.",
  },
  {
    q: "What happens if I hit the agent limit?",
    a: "Upgrade your tier, archive temporary agents, or let the Executive Agent recommend reallocation. Nothing breaks mid-task.",
  },
  {
    q: "Is my data used for training?",
    a: "No. Your data, memory, and documents are never used for model training without explicit consent (docs/38).",
  },
  {
    q: "Can I self-host?",
    a: "Enterprise plans include private deployment. The whole stack is FOSS-first and self-hostable.",
  },
  {
    q: "Can I change or cancel my plan?",
    a: "Yes — upgrades are prorated, downgrades apply at renewal, and you can cancel anytime. Your data and audit trail remain yours.",
  },
  {
    q: "What about voice and infrastructure usage?",
    a: "Optional add-ons on Business/Enterprise. Metered fairly, never bundled into surprise fees.",
  },
];

const tierNames = ["Free", "Pro", "Business", "Enterprise"] as const;

export function PricingPage() {
  const [billing, setBilling] = useState<Billing>("monthly");
  const priceRow: Record<Billing, string[]> = {
    monthly: ["$0", "$49/mo", "$199/mo", "Custom"],
    annual: ["$0", "$39/mo", "$159/mo", "Custom"],
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ---------- Navy mesh hero ---------- */}
      <section className="bg-mesh relative overflow-hidden">
        <div aria-hidden className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white" />

        <div className="relative">
          <SiteHeader variant="navy" />

          <div className="mx-auto max-w-4xl px-6 pt-16 text-center sm:pt-24">
            <p className="animate-fade-up eyebrow inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Pricing — one platform price
            </p>
            <h1 className="animate-fade-up mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white [animation-delay:0.08s] sm:text-6xl">
              Run your company with an AI workforce.
              <br />
              <span className="text-white/85">One platform price. You own the models.</span>
            </h1>
            <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg text-white/70 [animation-delay:0.16s]">
              ORQ8 is the operating system for an AI-staffed organization — governance, approvals,
              memory, and executive reporting built in. A simple platform price. Bring your own
              model keys, or run on free local models.
            </p>

            {/* Billing toggle — drives the cards and the comparison table */}
            <div className="animate-fade-up mt-9 inline-flex items-center rounded-full border border-white/15 bg-white/5 p-1 text-sm [animation-delay:0.24s]">
              <button
                type="button"
                onClick={() => setBilling("monthly")}
                aria-pressed={billing === "monthly"}
                className={`rounded-full px-5 py-2 transition-colors ${
                  billing === "monthly" ? "bg-white text-navy-900" : "text-white/70 hover:text-white"
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBilling("annual")}
                aria-pressed={billing === "annual"}
                className={`rounded-full px-5 py-2 transition-colors ${
                  billing === "annual" ? "bg-white text-navy-900" : "text-white/70 hover:text-white"
                }`}
              >
                Annual
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 font-mono text-[10px] ${
                    billing === "annual" ? "bg-emerald-400 text-navy-900" : "bg-white/10 text-emerald-300"
                  }`}
                >
                  save 20%
                </span>
              </button>
            </div>

            <p className="animate-fade-up mt-6 font-mono text-xs tracking-wide text-white/50 [animation-delay:0.3s]">
              No per-agent commissions · No agent marketplace · BYOK or free/local models
            </p>
          </div>
        </div>
      </section>

      {/* ---------- Tier cards ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`relative flex flex-col rounded-xl border p-6 ${
                plan.featured
                  ? "border-navy-700 bg-navy-900 text-white"
                  : "border-hairline bg-white text-ink"
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-emerald-400 px-3 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-navy-900">
                  Most popular
                </span>
              )}
              <h2
                className={`font-mono text-[11px] font-semibold uppercase tracking-[0.22em] ${
                  plan.featured ? "text-emerald-300" : "text-muted"
                }`}
              >
                {plan.name}
              </h2>
              <div className="mt-4">
                <span className={`text-3xl font-semibold tracking-tight ${plan.featured ? "text-white" : "text-navy-900"}`}>
                  {billing === "monthly" ? plan.price.monthly : plan.price.annual}
                </span>
                <p className={`mt-1 text-sm ${plan.featured ? "text-white/60" : "text-muted"}`}>
                  {billing === "monthly" ? plan.note.monthly : plan.note.annual}
                </p>
              </div>
              <p className={`mt-4 text-sm ${plan.featured ? "text-white/70" : "text-muted"}`}>{plan.blurb}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {plan.features.map((f, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      aria-hidden
                      className={`mt-0.5 shrink-0 font-semibold ${
                        plan.featured ? "text-emerald-300" : "text-navy-700"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={plan.featured ? "text-white/85" : "text-ink/90"}>
                      {f.lead && <strong className="font-semibold">{f.lead}</strong>}
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
              <Button href="#" variant={plan.ctaVariant} className="mt-6 w-full">
                {plan.cta}
              </Button>
            </article>
          ))}
        </div>
        <p className="mt-8 text-center font-mono text-xs text-muted">
          Free to start · Prorated upgrades · Cancel anytime
        </p>
      </section>

      {/* ---------- What's in every plan ---------- */}
      <section className="border-y border-hairline bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <p className="eyebrow text-muted">In every plan</p>
          <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-navy-900">
            The system runs the organization. You stay the CEO.
          </h2>
          <ul className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {everyPlan.map((item) => (
              <li key={item.lead} className="flex gap-3">
                <span aria-hidden className="mt-1 font-semibold text-emerald-500">
                  ✓
                </span>
                <p className="text-sm text-muted">
                  <strong className="font-semibold text-ink">{item.lead}</strong> {item.text}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------- How pricing works ---------- */}
      <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <p className="eyebrow text-muted">How pricing works</p>
        <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-navy-900">
          You pay for the platform. You pay for your models. We never mark up either.
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {pricingSteps.map((step, i) => (
            <li key={step.title} className="border-t border-hairline pt-4">
              <p className="font-mono text-sm font-semibold text-navy-700">0{i + 1}</p>
              <h3 className="mt-2 font-semibold text-ink">{step.title}</h3>
              <p className="mt-2 text-sm text-muted">{step.text}</p>
            </li>
          ))}
        </ol>
        <blockquote className="mt-10 rounded-xl border border-navy-800 bg-canvas p-6 text-navy-800">
          <strong className="font-semibold">Why no per-agent commissions?</strong> Because we sell
          the operating system, not the employees. Your AI workforce works for you — not for us.
        </blockquote>
      </section>

      {/* ---------- Comparison table ---------- */}
      <section className="border-y border-hairline bg-canvas">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <p className="eyebrow text-muted">Compare plans</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-navy-900">
            Everything, side by side.
          </h2>
          <div className="mt-8 overflow-x-auto rounded-xl border border-hairline bg-white">
            <table className="w-full min-w-[680px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="py-4 pl-6 pr-4 text-left font-medium text-muted" scope="col" />
                  {tierNames.map((name, i) => (
                    <th
                      key={name}
                      scope="col"
                      className={`px-4 py-4 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        name === "Pro" ? "text-navy-800" : "text-muted"
                      }`}
                    >
                      {name}
                      {i === 1 && (
                        <span className="mt-1 block text-[10px] normal-case tracking-normal text-emerald-500">
                          most popular
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ["Price", ...priceRow[billing]],
                  ...comparison,
                ].map(([label, free, pro, business, enterprise]) => (
                  <tr key={label} className="border-b border-hairline/60 last:border-0">
                    <th scope="row" className="py-2.5 pl-6 pr-4 text-left font-normal text-ink">
                      {label}
                    </th>
                    {[free, pro, business, enterprise].map((v, i) => (
                      <td
                        key={i}
                        className={`px-4 py-2.5 text-center ${
                          i === 1 ? "bg-navy-900/[0.04]" : ""
                        } ${
                          v === "✓"
                            ? "font-semibold text-emerald-600"
                            : v === "—"
                              ? "text-muted/40"
                              : "text-ink"
                        }`}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
        <p className="eyebrow text-center text-muted">Questions</p>
        <h2 className="mt-3 text-center text-3xl font-semibold tracking-tight text-navy-900">
          Frequently asked
        </h2>
        <div className="mt-6">
          {faqs.map((f) => (
            <details key={f.q} className="group border-b border-hairline py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink">
                {f.q}
                <span
                  aria-hidden
                  className="shrink-0 text-xl leading-none text-muted transition-transform duration-200 group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- CTA footer (mesh, matching the landing) ---------- */}
      <section
        className="bg-mesh relative overflow-hidden"
        style={{ "--mesh-accent": "rgb(252 211 77 / 0.22)" } as CSSProperties}
      >
        <div aria-hidden className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_bottom,black_25%,transparent_70%)]" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-transparent" />

        <div className="relative mx-auto max-w-6xl px-6 py-20 text-center sm:py-24">
          <p className="eyebrow inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            One price · Your models · Your organization
          </p>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Tell ORQ8 what you want.
            <br />
            It hires the team, does the work, and reports back.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">
            Start free on the free/local stack. Bring your own keys when you want frontier models.
            No commissions. No agent marketplace. Ever.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button href="#" variant="outline-light" size="lg">
              Start free
            </Button>
            <Button href="#" variant="outline-light" size="lg">
              Get Pro
            </Button>
            <Button href="#" variant="ghost-light" size="lg">
              Talk to sales
            </Button>
          </div>
          <p className="mt-6 font-mono text-xs tracking-wide text-white/50">
            Free to start · Runs on free/local models · BYOK · No per-agent commissions, ever
          </p>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
