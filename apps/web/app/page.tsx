import type { Metadata } from "next";
import { Button } from "../components/button";
import { MockCeoHome } from "../components/mock-ceo-home";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { WaitlistForm } from "../components/waitlist-form";
import { API_URL } from "../lib/api";

export const metadata: Metadata = {
  title: "The AI Organization Operating System",
  description:
    "Tell ORQ8 what you want. It hires the team, does the work, and reports back. Not a chatbot. Not an agent zoo. An operating system for a company staffed by AI employees.",
};

// Social proof for the waitlist section; silently hidden if the API is unreachable.
async function getWaitlistCount(): Promise<number | null> {
  try {
    const res = await fetch(`${API_URL}/v1/waitlist/count`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.data?.count === "number" ? data.data.count : null;
  } catch {
    return null;
  }
}

const problems = [
  {
    title: "Inbox of agent noise",
    text: "Your inbox fills with agent updates; your money disappears into model tokens; and nothing remembers why a decision was made.",
  },
  {
    title: "Costs run away",
    text: "Most agent projects die on cost control, unclear value, and missing risk controls — not on model quality.",
  },
  {
    title: "No one to delegate to",
    text: "As a solo operator, you have no middle management. You drown in operations.",
  },
];

const steps = [
  {
    n: "01",
    title: "You speak. It understands.",
    text: "Give ORQ8 a vague idea, a link, a document, or a question — “I think there’s a business here. Investigate it.” The Executive Agent figures out intent, forms the right team, and plans the work. No forms. No 12 fields.",
  },
  {
    n: "02",
    title: "It deliberates like a real organization.",
    text: "A council of AI employees researches independently and challenges one another. The Executive Agent synthesizes a recommendation with evidence, alternatives, confidence, and the approval required. You decide in the Decision Center — approve, reject, or modify with full context.",
  },
  {
    n: "03",
    title: "It hires, executes, and reports.",
    text: "Temporary AI employees are hired with business cases, onboarded, and put to work — using tools, requesting approvals, flagging blockers. The organization learns, writes to Company Memory, and sends you a weekly report. All of it audited.",
  },
];

const features = [
  {
    badge: "G",
    title: "Governance in code, not prompts",
    text: "A Company Constitution defines what the organization will never do. Approval tiers, spending authority, and forbidden actions are enforced server-side — no agent can bypass them, even with a clever prompt.",
    dark: true,
    span: "lg:col-span-3",
  },
  {
    badge: "D",
    title: "The CEO Decision Center",
    text: "One calm place for everything that needs you: approvals, hiring requests, budget escalations, risky actions — each with what, why, evidence, alternatives, cost, and risk. Approve in seconds. No notification noise.",
    dark: false,
    span: "lg:col-span-3",
  },
  {
    badge: "W",
    title: "An AI workforce, hired like a real one",
    text: "Agents are hired with business cases, organized into departments, teams, and temporary project teams — with performance reviews and knowledge transfer.",
    dark: false,
    span: "lg:col-span-2",
  },
  {
    badge: "$",
    title: "Money & budget control",
    text: "Budget allocation is separate from spending authority. Target, warning, and ceiling levels. Every dollar tracked to a department, project, and agent.",
    dark: false,
    span: "lg:col-span-2",
  },
  {
    badge: "M",
    title: "Company memory & precedent",
    text: "The organization remembers decisions and why they were made. Agents consult precedent before re-proposing what was already rejected.",
    dark: false,
    span: "lg:col-span-2",
  },
  {
    badge: "R",
    title: "Model-agnostic & cost-aware",
    text: "Routes every task to the cheapest adequate model. Use free local models, or bring your own keys for OpenAI, Anthropic, Gemini, DeepSeek, Groq, OpenRouter. No lock-in. No markup.",
    dark: true,
    span: "lg:col-span-3",
  },
  {
    badge: "E",
    title: "Executive reporting",
    text: "Weekly briefings and monthly executive reports, prepared by a reporting agent and reviewed by the Executive Agent. The loop closes: intent → execute → report → learn.",
    dark: false,
    span: "lg:col-span-3",
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

export default async function Home() {
  const waitlistCount = await getWaitlistCount();

  return (
    <div className="min-h-screen bg-white">
      <main>
        {/* ---------- Hero ---------- */}
        <section className="relative overflow-hidden bg-navy-900">
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-navy-900 via-navy-800 to-navy-900" />
          <div aria-hidden className="absolute -top-40 left-1/2 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-navy-700/40 blur-3xl" />
          <div aria-hidden className="absolute right-[-10rem] top-24 h-80 w-80 rounded-full bg-amber-300/10 blur-3xl" />
          <div aria-hidden className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />

          <div className="relative">
            <SiteHeader
              variant="navy"
              cta={{ href: "#waitlist", label: "Get early access" }}
            />

            <div className="mx-auto max-w-4xl px-6 pt-16 text-center sm:pt-24">
              <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-medium tracking-wide text-white/80">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                The AI Organization Operating System
              </p>
              <h1 className="animate-fade-up mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white [animation-delay:0.08s] sm:text-6xl">
                Tell ORQ8 what you want.
                <br />
                It hires the team, does the work, and reports back.
              </h1>
              <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-lg text-white/70 [animation-delay:0.16s]">
                Not a chatbot. Not a task manager. Not an agent zoo. An operating system for a
                company staffed by AI employees — with governance, approvals, memory, and executive
                reporting built in.{" "}
                <span className="font-medium text-white">You stay the CEO. The system runs the organization.</span>
              </p>
              <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3 [animation-delay:0.24s]">
                <Button href="#waitlist" variant="outline-light" size="lg">
                  Get early access
                </Button>
                <Button href="#how-it-works" variant="ghost-light" size="lg">
                  See how it works
                </Button>
              </div>
              <p className="animate-fade-up mt-6 text-sm text-white/50 [animation-delay:0.3s]">
                Free to start · Runs on free/local models · Bring your own model keys · No per-agent
                commissions, ever
              </p>
            </div>

            <div className="animate-fade-up px-6 pb-20 [animation-delay:0.38s]">
              <MockCeoHome />
            </div>
          </div>
        </section>

        {/* ---------- Trust strip ---------- */}
        <section className="border-b border-hairline bg-white">
          <div className="mx-auto max-w-6xl px-6 py-12">
            <p className="mx-auto max-w-3xl text-center text-lg font-medium leading-relaxed text-navy-800">
              Paste an idea → researched, council-reviewed recommendation → an executed validation
              plan run by a temporary AI team — every dollar tracked, every decision explainable.
            </p>
            <p className="mt-4 text-center text-sm text-muted">
              Built for solo founders and indie operators — the one-person company, powered by AI.
            </p>
          </div>
        </section>

        {/* ---------- The problem ---------- */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">The problem</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
              Everyone is building AI agents. Nobody is building the system that makes them safe,
              governed, and accountable.
            </h2>
          </div>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {problems.map((p, i) => (
              <div key={p.title} className="rounded-2xl border border-hairline bg-canvas/60 p-6">
                <p className="text-sm font-medium text-navy-800">0{i + 1}</p>
                <h3 className="mt-3 font-semibold text-ink">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-lg text-navy-800">
            ORQ8 is the layer that&rsquo;s missing:{" "}
            <strong className="font-semibold">the operating system for an AI-staffed organization.</strong>
          </p>
        </section>

        {/* ---------- How it works ---------- */}
        <section id="how-it-works" className="border-y border-hairline bg-canvas">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">How it works</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
              The Golden Workflow — from vague idea to executed plan
            </h2>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="relative">
                  <p className="text-5xl font-semibold text-navy-700/25">{s.n}</p>
                  <h3 className="mt-3 font-semibold text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-12 rounded-2xl border border-hairline bg-white p-6 text-sm leading-relaxed text-muted shadow-sm">
              <strong className="font-semibold text-ink">Example:</strong> “I think we should build an
              AI customer support product for African businesses. Find out whether this is worth
              pursuing.” → council of market researcher, finance analyst, legal researcher, growth
              strategist → recommendation → your approval → validation project with a hired AI team →
              weekly report.
            </div>
          </div>
        </section>

        {/* ---------- Features (bento) ---------- */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">What&rsquo;s inside</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
            A company, not a dashboard
          </h2>
          <div className="mt-10 grid gap-5 lg:grid-cols-6">
            {features.map((f) => (
              <div
                key={f.title}
                className={`rounded-2xl border p-7 ${
                  f.dark
                    ? "border-navy-700 bg-navy-900 text-white"
                    : "border-hairline bg-white text-ink shadow-sm"
                } ${f.span}`}
              >
                <span
                  aria-hidden
                  className={`grid h-9 w-9 place-items-center rounded-lg text-sm font-semibold ${
                    f.dark ? "bg-white/10 text-white" : "bg-navy-800/5 text-navy-800"
                  }`}
                >
                  {f.badge}
                </span>
                <h3 className={`mt-4 font-semibold ${f.dark ? "text-white" : "text-navy-900"}`}>{f.title}</h3>
                <p className={`mt-2 text-sm leading-relaxed ${f.dark ? "text-white/70" : "text-muted"}`}>
                  {f.text}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- Waitlist ---------- */}
        <section id="waitlist" className="border-y border-hairline bg-canvas">
          <div className="mx-auto max-w-2xl px-6 py-20 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Early access</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-navy-900 sm:text-4xl">
              Be first in the door
            </h2>
            <p className="mt-4 text-muted">
              We&rsquo;re onboarding a small cohort of design partners first — one real decision in
              two weeks, honest feedback in return. Join the list and we&rsquo;ll email you when your
              cohort opens.
            </p>
            <div className="mx-auto mt-8 max-w-md">
              <WaitlistForm />
            </div>
            <p className="mt-4 text-sm text-muted">
              Free during beta · BYOK · No per-agent commissions{waitlistCount !== null ? ` · ${waitlistCount}+ already on the list` : ""}
            </p>
          </div>
        </section>

        {/* ---------- Testimonials ---------- */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="text-3xl font-semibold tracking-tight text-navy-900">Testimonials</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <figure key={t.name} className="rounded-2xl border border-hairline bg-white p-6 shadow-sm">
                <blockquote className="text-sm leading-relaxed text-ink">&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption className="mt-4 text-sm font-medium text-muted">— {t.name}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* ---------- FAQ ---------- */}
        <section className="mx-auto max-w-3xl px-6 pb-20">
          <h2 className="text-3xl font-semibold tracking-tight text-navy-900">Frequently asked</h2>
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
        <section className="relative overflow-hidden bg-navy-900">
          <div aria-hidden className="absolute -top-32 left-1/2 h-72 w-[48rem] -translate-x-1/2 rounded-full bg-navy-700/50 blur-3xl" />
          <div className="relative mx-auto max-w-2xl px-6 py-20 text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Tell ORQ8 what you want. It hires the team, does the work, and reports back.
            </h2>
            <p className="mt-4 text-white/70">
              Free to start. Your keys, no markup, no commissions. You stay the CEO.
            </p>
            <div className="mx-auto mt-8 max-w-md">
              <WaitlistForm variant="navy" source="cta" />
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
