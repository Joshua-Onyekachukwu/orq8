import { Button } from "../components/button";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";

const steps = [
  {
    title: "1. You speak. It understands.",
    text: "Give ORQ8 a vague idea, a link, or a question — \"I think there's a business here. Investigate it.\" The Executive Agent figures out intent, forms the right team, and plans the work.",
  },
  {
    title: "2. It deliberates like a real organization.",
    text: "A council of AI employees researches independently and challenges one another. The Executive Agent synthesizes a recommendation with evidence, alternatives, and confidence. You decide in the Decision Center.",
  },
  {
    title: "3. It hires, executes, and reports.",
    text: "Temporary AI employees are hired with business cases, onboarded, and put to work. The organization learns, writes to Company Memory, and sends you a weekly report. All of it audited.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <main>
        <section className="border-b border-hairline">
          <div className="mx-auto max-w-4xl px-6 py-20 text-center sm:py-28">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              The AI Organization Operating System
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-navy-900 sm:text-6xl">
              Tell ORQ8 what you want. It hires the team, does the work, and reports back.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
              Not a chatbot. Not a task manager. Not an agent zoo. An operating system for a company
              staffed by AI employees — with governance, approvals, memory, and executive reporting
              built in. You stay the CEO. The system runs the organization.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button href="/pricing">Get started — free</Button>
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

        <section id="how-it-works" className="mx-auto max-w-6xl px-6 py-16">
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
          <div className="mt-12 text-center">
            <Button href="/pricing" variant="outline">
              See pricing
            </Button>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
