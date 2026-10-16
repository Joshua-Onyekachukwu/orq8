import Link from "next/link";
import { Check } from "lucide-react";

import { EAOpenButton } from "../dashboard/ea-open-button";

export interface FirstValueStep {
  title: string;
  detail: string;
  done: boolean;
  href: string | null;
  cta: string;
}

/**
 * First-value checklist (B6: moved from the dashboard). Hire → goal → task →
 * completed; derives from real rows and dismisses itself when the first task
 * completes.
 */
export function FirstValueChecklist({
  steps,
  hasTasks,
  orgName,
}: {
  steps: FirstValueStep[];
  hasTasks: boolean;
  orgName: string;
}) {
  const primaryActionClass =
    "inline-flex items-center justify-center rounded-lg ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep";
  const secondaryActionClass =
    "inline-flex items-center justify-center rounded-lg border border-hairline bg-white px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-canvas";

  return (
    <section aria-label="Getting to first value" className="rounded-2xl border border-hairline bg-white p-6">
      <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-muted">
        First value
      </p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">
        {hasTasks ? "Almost there — close the loop" : "Four steps to a running company"}
      </h2>
      <ol className="mt-4 space-y-3">
        {steps.map((step) => (
          <li key={step.title} className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={
                  step.done
                    ? "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink text-white"
                    : "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-muted"
                }
              >
                {step.done ? <Check className="h-3 w-3" /> : null}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {step.title}
                  {step.done ? <span className="ml-2 text-xs font-normal text-muted">Done</span> : null}
                </p>
                <p className="mt-0.5 text-xs text-muted">{step.detail}</p>
              </div>
            </div>
            {step.done && step.href ? (
              <Link href={step.href} className={secondaryActionClass}>
                {step.cta}
              </Link>
            ) : !step.done && step.href ? (
              <Link href={step.href} className={primaryActionClass}>
                {step.cta}
              </Link>
            ) : !step.done ? (
              <EAOpenButton
                prompt={`Plan the work for ${orgName}: break the current goal into tasks and assign them.`}
                className={primaryActionClass}
              >
                {step.cta}
              </EAOpenButton>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
