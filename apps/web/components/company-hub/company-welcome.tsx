import Link from "next/link";

import { EAOpenButton } from "../dashboard/ea-open-button";
import type { FounderStage } from "../executive-agent-context";
import { SeedDemoButton } from "./seed-demo-button";

/**
 * First-run welcome (B6: moved from the dashboard, which keeps
 * decisions-blocked-active-next). Shown while the company has no structure
 * yet — the founder's starting point, so it lives on the company page.
 */
export function CompanyWelcome({
  founderStage,
  orgName,
  eaName,
  firstName,
  canSeedDemo,
}: {
  founderStage: FounderStage;
  orgName: string;
  eaName: string;
  firstName: string | null;
  canSeedDemo: boolean;
}) {
  return (
    <section className="rounded-2xl border border-brand-deep/20 ink p-6 text-white">
      <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-ink-accent">
        {founderStage === "new" ? "First run" : "In progress"}
      </p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">
        {founderStage === "new" ? "Let's get your company set up" : `Finish setting up ${orgName}`}
      </h2>
      <p className="mt-2 max-w-2xl text-2sm text-white/70">
        {founderStage === "new"
          ? `I am ${eaName}, your Executive Agent. Before I organize work I need to know what you are building, where you are today, and what you want to accomplish.`
          : "What you have already given me is saved. I can pick up where we left off, and nothing is activated until you approve it."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/onboarding"
          className="inline-flex items-center justify-center rounded-lg bg-ink-accent px-4 py-2 text-sm font-semibold text-ink-surface transition-colors hover:bg-ink-accent/90"
        >
          {founderStage === "new" ? "Start onboarding" : "Continue onboarding"}
        </Link>
        <EAOpenButton
          prompt={founderStage === "new" ? (firstName ? `I'm ${firstName}, and I'm building ` : "I'm building ") : "What is left to finish setting up my company?"}
          className="inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
        >
          {founderStage === "new" ? `Tell ${eaName} what you are building` : `Ask ${eaName} what remains`}
        </EAOpenButton>
        {canSeedDemo ? (
          <SeedDemoButton className="inline-flex items-center justify-center rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10 disabled:opacity-60" />
        ) : null}
      </div>
    </section>
  );
}
