import type { Metadata } from "next";
import Link from "next/link";
import { WaitlistForm } from "@/components/waitlist-form";

export const metadata: Metadata = {
  title: "ORQ8 on Product Hunt — Run a company of one",
  description:
    "ORQ8 hires the team, does the work, and reports back under your approvals and your budget. Live on Product Hunt — join the launch list.",
  openGraph: {
    title: "ORQ8 on Product Hunt — Run a company of one",
    description:
      "You set the direction. ORQ8 builds and manages your AI workforce to execute the work — while you stay in control of approvals and budget.",
    type: "website",
  },
};

const USE_CASES = [
  {
    title: "Founder inbox → morning briefing",
    before: "2 hours triaging email, Slack, and tasks every morning.",
    after: "One briefing: what moved, what needs you, what it costs.",
  },
  {
    title: "Idea → staffed plan in minutes",
    before: "Days writing specs and hiring contractors.",
    after: "Departments, AI employees, and a first task list in one pass.",
  },
  {
    title: "Work → approved, on budget",
    before: "No visibility into what AI tools actually did or spent.",
    after: "Every action gated by approvals with a credit ledger you can audit.",
  },
] as const;

export default function HuntPage() {
  return (
    <>
      {/* Hero — PH-specific tagline + capture */}
      <section className="ink relative z-[1] overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />
        <div className="container relative z-10 mx-auto px-[12px] pb-[80px] pt-[160px] text-center sm:max-w-[540px] md:max-w-[720px] md:pt-[200px] lg:max-w-[960px] lg:pt-[220px] xl:max-w-[1308px]">
          <div className="mb-[28px] inline-flex items-center gap-[10px] rounded-full border border-white/15 bg-white/5 px-[18px] py-[8px] backdrop-blur-[6px]">
            <span className="h-[6px] w-[6px] rounded-full bg-ink-accent" />
            <span className="text-overline font-bold uppercase tracking-[1.8px] text-ink-accent">
              Live on Product Hunt
            </span>
          </div>
          <h1 className="!mb-[20px] !text-[36px] !font-bold !leading-[1.05] !tracking-[-1px] md:!text-[52px] lg:!text-[64px]">
            <span className="text-white">Run a company </span>
            <span className="text-ink-accent">of one</span>
          </h1>
          <p className="mx-auto mb-[32px] max-w-[580px] text-md !leading-relaxed text-white md:text-[17px]">
            You set the direction. ORQ8 hires the team, does the work, and
            reports back under your approvals and your budget.
          </p>
          <div className="mx-auto max-w-[480px]">
            <WaitlistForm variant="dark" source="producthunt" />
          </div>
          <p className="mt-[20px] text-xs tracking-wide text-white/60">
            Hunting today? Upvote on Product Hunt, then join the list — 7-day
            free trial · No credit card required
          </p>
          <div className="mt-[16px] flex flex-col items-center justify-center gap-[14px] sm:flex-row">
            <Link
              href="/register"
              className="group inline-block rounded-full bg-brand-deep px-[28px] py-[14px] text-overline font-bold uppercase tracking-[1.8px] text-white transition-all hover:bg-ink-accent hover:text-ink-surface"
            >
              Get started
            </Link>
            <Link
              href="/#how-it-works"
              className="group inline-block rounded-full border border-white/15 bg-white/5 px-[28px] py-[14px] text-overline font-bold uppercase tracking-[1.8px] text-white/70 backdrop-blur-sm transition-all hover:border-ink-accent/60 hover:bg-white/10 hover:text-white"
            >
              See how it works
            </Link>
          </div>
        </div>
      </section>

      {/* 3 concrete before/after — the PH screenshots section points here */}
      <section className="relative z-[1] border-t border-hairline bg-surface-white py-[80px] md:py-[100px]">
        <div className="container mx-auto px-[20px] sm:max-w-[540px] md:max-w-[720px] md:px-[24px] lg:max-w-[960px] xl:max-w-[1200px]">
          <p className="text-overline font-bold uppercase tracking-[1.8px] text-muted">
            What it does for you
          </p>
          <h2 className="mt-[12px] max-w-[640px] !text-[28px] md:!text-[36px]">
            Three wins hunters can try this week
          </h2>
          <div className="mt-[32px] grid gap-[16px] md:grid-cols-3">
            {USE_CASES.map((u) => (
              <div
                key={u.title}
                className="rounded-[16px] border border-hairline bg-white p-[24px]"
              >
                <h3 className="text-md font-semibold text-ink">{u.title}</h3>
                <p className="mt-[12px] text-sm leading-relaxed text-muted">
                  <span className="font-semibold text-ink">Before: </span>
                  {u.before}
                </p>
                <p className="mt-[8px] text-sm leading-relaxed text-muted">
                  <span className="font-semibold text-ink">After: </span>
                  {u.after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Maker comment teaser — full text lives in docs/strategy/PH-LAUNCH-KIT.md */}
      <section className="relative z-[1] border-t border-hairline bg-surface-marketing py-[80px] md:py-[100px]">
        <div className="container mx-auto max-w-[720px] px-[20px] md:px-[24px]">
          <p className="text-overline font-bold uppercase tracking-[1.8px] text-muted">
            From the maker
          </p>
          <h2 className="mt-[12px] !text-[28px] md:!text-[36px]">
            Why I built an AI workforce for founders
          </h2>
          <div className="mt-[24px] space-y-[16px] text-md leading-relaxed text-ink">
            <p>
              Hiring is slow and expensive; AI tools are fast but unaccountable.
              I wanted the middle: a team that does the work and shows its
              receipts — every action approved, every credit accounted for.
            </p>
            <p>
              ORQ8 is that team. Tell it the outcome, approve the plan, and it
              executes across departments while you keep the budget and the
              final call. If you hunt today, tell me the one role you&apos;d
              hire first — I read every comment.
            </p>
          </div>
          <div className="mt-[32px] rounded-[16px] border border-hairline bg-white p-[24px]">
            <p className="text-sm font-semibold text-ink">
              Launch ask — 30 seconds
            </p>
            <ol className="mt-[12px] list-decimal space-y-[8px] pl-[20px] text-sm leading-relaxed text-muted">
              <li>Upvote and comment with the role you&apos;d hire first.</li>
              <li>Join the list above so we can invite your cohort.</li>
              <li>Try one briefing and tell us what it got wrong.</li>
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
