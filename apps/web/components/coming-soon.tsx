import Link from "next/link";
import { Sparkles } from "lucide-react";

/**
 * Styled placeholder for a feature that exists in the sidebar but lands in a
 * later phase (docs/49). Always lists what the module will contain so the
 * surface is informative, never a dead end.
 */
export function ComingSoon({
  title,
  phase,
  description,
  contains,
}: {
  title: string;
  phase: string;
  description: string;
  contains: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
        {phase}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
        {title}
      </h1>

      <div className="mt-6 rounded-xl border border-hairline bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-900 text-emerald">
            <Sparkles className="h-5 w-5" />
          </span>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-navy-800">
            Arrives in {phase}
          </p>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted">{description}</p>

        <div className="mt-6">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            What this module will contain
          </p>
          <ul className="mt-3 space-y-2">
            {contains.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm text-ink">
                <span aria-hidden className="mt-0.5 shrink-0 font-semibold text-emerald">
                  ✓
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-6 text-sm text-muted">
        The sidebar always shows the full system so you know what ORQ8 grows
        into. Everything else you do today is audited and tenant-isolated.{" "}
        <Link href="/app" className="font-medium text-navy-800 underline-offset-2 hover:underline">
          Back to the dashboard →
        </Link>
      </p>
    </div>
  );
}
