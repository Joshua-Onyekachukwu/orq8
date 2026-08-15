import type { Metadata } from "next";
import { Button } from "../components/button";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";

export const metadata: Metadata = {
  title: "The AI Organization Operating System",
  description:
    "Tell ORQ8 what you want. It hires the team, does the work, and reports back. Not a chatbot. Not an agent zoo. An operating system for a company staffed by AI employees.",
};

const trustStats = [
  "Paste an idea → researched, council-reviewed recommendation → an executed validation plan run by a temporary AI team — every dollar tracked, every decision explainable",
  "Every decision explainable · every dollar tracked",
];

const problems = [
  "Your inbox fills with agent updates; your money disappears into model tokens; and nothing remembers why a decision was made.",
  "Most agent projects die on cost control, unclear value, and missing risk controls — not on model quality.",
  "As a solo operator, you have no middle management to delegate to. You drown in operations.",
];

const steps = [
  {
    title: "1. You speak. It understands.",
    text: "Give ORQ8 a vague idea, a link, a document, or a question — \"I think there's a business here. Investigate it.\" The Executive Agent figures out intent, forms the right team, and plans the work. No forms. No 12 fields.",
  },
  {
    title: "2. It deliberates like a real organization.",
    text: "A council of AI employees researches independently and challenges one another. The Executive Agent synthesizes a recommendation with evidence, alternatives, confidence, and the approval required. You decide in the Decision Center — approve, reject, or modify with full context.",
  },
  {
    title: "3. It hires, executes, and reports.",
    text: "Temporary AI employees are hired with business cases, onboarded, and put to work — using tools, requesting approvals, flagging blockers. The organization learns, writes to Company Memory, and sends you a weekly report. All of it audited.",
  },
];

const features = [
  {
    title: "Governance in code, not prompts",
    text: "A Company Constitution defines what the organization will never do. Approval tiers, spending authority, and forbidden actions are enforced server-side — no agent can bypass them, even with a clever prompt.",
  },
  {
    title: "The CEO Decision Center",
    text: "One calm place for everything that needs you: approvals, hiring requests, budget escalations, risky actions, blocked work — each with what, why, evidence, alternatives, cost, and risk. Approve in seconds. No notification noise.",
  },
  {
    title: "An AI workforce, hired like a real one",
    text: "Agents are hired with business cases, organized into departments, teams, and temporary project teams — with performance reviews, versioning, and knowledge transfer when someone is replaced.",
  },
  {
    title: "Money & budget control",
    text: "Budget allocation is separate from spending authority. Target, warning, and ceiling levels. Every dollar of model and tool spend tracked to a department, project, and agent.",
  },
  {
    title: "Company memory & decision precedent",
    text: "The organization remembers decisions and why they were made. Agents consult precedent before re-proposing what was already rejected — and explain what changed.",
  },
  {
    title: "Model-agnostic & cost-aware",
    text: "Routes every task to the cheapest adequate model. Use free local models, or bring your own keys for OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter. No lock-in. No markup.",
  },
  {
    title: "Executive reporting",
    text: "Weekly briefings and monthly executive reports, prepared by a reporting agent and reviewed by the Executive Agent. The loop closes: intent → execute → report → learn.",
  },
];

const testimonials = [
  {
    quote:
      "I pasted one idea. Two days later I had a council-reviewed recommendation and a validation plan my AI team had already executed.",
    name: "[Name, solo founder]",
  },
  {
    quote:
      "It's the first tool that treats my company as an organization, not a chat window. And I approve everything that matters.",
    name: "[Name, indie operator]",
  },
  {
    quote: "The audit trail alone is worth the price. I finally know where every dollar of AI spend went.",
    name: "[Name, agency principal]",
  },
];

const faqs = [
  {
    q: "Do I need my own API keys?",
    a: "No — free/local models are included. Add your keys for frontier models; you pay the provider directly, we never mark up.",
  },
  {
    q: "Is there a per-agent fee?",
    a: "No. Plans cover up to a tier's AI employees. No seat tax, no commissions, no marketplace.",
  },
  {
    q: "Is my data used for training?",
    a: "Never without explicit consent.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Your data and audit trail remain yours.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <main>
        {/* ---------- Hero ---------- */}
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              The AI Organization Operating System
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-navy-900 sm:text-6xl">
              Tell ORQ8 what you want. It hires the team, does the work, and reports back.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
              Not a chatbot. Not a task manager. Not an agent zoo. ORQ8 is an operating system for a
              company staffed by AI employees — with governance, approvals, memory, and executive
              reporting built in. You stay the CEO. The system runs the organization.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button href="/pricing">Start free</Button>
              <Button href="/#how-it-works" variant="outline">
                See how it works
              </Button>
            </div>
            <p className="mt-6 text-sm text-muted">
              Free to start · Runs on free/local models · Bring your own model keys · No per-agent
              commissions, ever
            </p>
          </div>
        </section>

        {/* ---------- Trust strip ---------- */}
        <section className="border-b border-hairline bg-canvas">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-2">
            <p className="text-sm text-muted">
              Built for solo founders and indie operators — the one-person company, powered by AI.
            </p>
            {trustStats.map((stat) => (
              <p key={stat} className="text-sm font-medium text-navy-800">
                {stat}
              </p>
            ))}
          </div>
        </section>

        {/* ---------- The problem ---------- */}
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-navy-900">The problem — &ldquo;agent chaos&rdquo;</h2>
          <p className="mt-4 text-lg text-ink">
            Everyone is building AI agents. Nobody is building the system that makes them safe,
            governed, and accountable.
          </p>
          <ul className="mt-6 space-y-3 text-muted">
            {problems.map((p) => (
              <li key={p} className="flex gap-3">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-navy-700" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-8 font-medium text-navy-800">
            ORQ8 is the layer that&rsquo;s missing: <strong>the operating system for an AI-staffed organization.</strong>
          </p>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how-it-works" className="border-y border-hairline bg-canvas">
          <div className="mx-auto max-w-6xl px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight text-navy-900">
              How it works — the Golden Workflow
            </h2>
            <div className="mt-8 grid gap-8 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.title} className="border-t border-hairline pt-4">
                  <h3 className="font-semibold text-ink">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted">{step.text}</p>
                </div>
              ))}
            </div>
            <p className="mt-10 rounded-lg border border-hairline bg-white p-5 text-sm text-muted">
              <strong className="font-semibold text-ink">Example:</strong> &ldquo;I think we should build an AI
              customer support product for African businesses. Find out whether this is worth
              pursuing.&rdquo; → council of market researcher, finance analyst, legal researcher,
              growth strategist → recommendation → your approval → validation project with a hired
              AI team → weekly report.{" "}
              <a href="#" className="text-navy-700 underline decoration-hairline underline-offset-2 hover:text-navy-800">
                [Link to full story placeholder]
              </a>
            </p>
          </div>
        </section>

        {/* ---------- Features ---------- */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-navy-900">What&rsquo;s inside</h2>
          <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="border-t border-hairline pt-4">
                <h3 className="font-semibold text-navy-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Callout ---------- */}
        <section className="border-y border-hairline bg-canvas">
          <div className="mx-auto max-w-3xl px-6 py-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-navy-900">
              Your attention is the resource
            </h2>
            <p className="mt-4 text-muted">
              Other platforms give you more agents and more noise. ORQ8 protects your attention —
              routine work runs autonomously, consequential decisions reach you, and everything else
              waits quietly in a queue.{" "}
              <strong className="font-semibold text-ink">
                The scarcest resource in your company is you.
              </strong>
            </p>
          </div>
        </section>

        {/* ---------- Who it's for ---------- */}
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-navy-900">Who it&rsquo;s for</h2>
          <p className="mt-4 font-medium text-ink">
            The solo founder. The indie operator. The one-person company.
          </p>
          <ul className="mt-4 space-y-3 text-muted">
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-navy-700" />
              <span>You have ideas, customers, and too much to do — and no team to delegate to.</span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-navy-700" />
              <span>You want an organization that works while you sleep — but you never want to lose control.</span>
            </li>
            <li className="flex gap-3">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-navy-700" />
              <span>You want every dollar and every decision accounted for.</span>
            </li>
          </ul>
          <p className="mt-6 text-sm text-muted">
            [Secondary audiences — later: agencies, small teams, then growing companies.]
          </p>
        </section>

        {/* ---------- Pricing teaser ---------- */}
        <section className="border-y border-hairline bg-canvas">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-navy-900">Pricing</h2>
            <p className="mt-3 text-lg font-medium text-navy-800">
              One platform price. You own the models. No per-agent commissions.
            </p>
            <p className="mt-3 text-sm text-muted">
              <strong className="font-medium text-navy-800">Free</strong> — start now ·{" "}
              <strong className="font-medium text-navy-800">Pro $49/mo</strong> — the solo
              founder&rsquo;s company ·{" "}
              <strong className="font-medium text-navy-800">Business $199/mo</strong> — growing
              operations · <strong className="font-medium text-navy-800">Enterprise</strong> —
              private deployment.
            </p>
            <div className="mt-6">
              <Button href="/pricing" variant="outline">
                See full pricing
              </Button>
            </div>
          </div>
        </section>

        {/* ---------- Testimonials ---------- */}
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight text-navy-900">Testimonials</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure key={t.name} className="rounded-lg border border-hairline bg-white p-6">
                <blockquote className="text-sm leading-relaxed text-ink">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption className="mt-4 text-sm font-medium text-muted">— {t.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="mx-auto max-w-3xl px-6 pb-16">
          <h2 className="text-2xl font-semibold tracking-tight text-navy-900">Frequently asked</h2>
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
          <p className="mt-6 text-sm">
            <a href="/pricing" className="text-navy-700 underline decoration-hairline underline-offset-2 hover:text-navy-800">
              Full FAQ on the pricing page →
            </a>
          </p>
        </section>

        {/* ---------- Final CTA ---------- */}
        <section className="bg-navy-900">
          <div className="mx-auto max-w-4xl px-6 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Tell ORQ8 what you want. It hires the team, does the work, and reports back.
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button href="/pricing" variant="outline-light">
                Start free — no card required
              </Button>
              <Button href="/pricing" variant="ghost-light">
                Talk to us
              </Button>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
