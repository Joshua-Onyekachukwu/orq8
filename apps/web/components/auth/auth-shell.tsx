import Link from "next/link";
import type { ReactNode } from "react";

// Shared dark shell for every authentication page. Deep green is the dominant
// surface, orange stays the accent, hairline borders, spacing on the
// 4/8/12/16/24/32 scale, two font weights, no gradients or glow effects.

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
  brandHeadline,
  brandBody,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  brandHeadline: string;
  brandBody: string;
}) {
  return (
    <div id="main" className="flex min-h-screen ink">
      {/* Left panel: brand statement (desktop only) */}
      <div className="hidden w-1/2 flex-col justify-between border-r border-white/10 bg-brand p-12 lg:flex">
        <Link
          href="/"
          className="flex items-baseline gap-1.5 text-2xl font-semibold tracking-tight text-white"
        >
          ORQ8
          <span className="h-2 w-2 rounded-full bg-warm" aria-hidden />
        </Link>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight text-white">
            {brandHeadline}
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/60">
            {brandBody}
          </p>
        </div>

        <p className="text-xs text-white/30">&copy; 2026 ORQ8</p>
      </div>

      {/* Right panel: form */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <Link
          href="/"
          className="mb-8 flex items-baseline gap-1.5 text-2xl font-semibold tracking-tight text-white lg:hidden"
        >
          ORQ8
          <span className="h-2 w-2 rounded-full bg-warm" aria-hidden />
        </Link>

        <div className="w-full max-w-sm">
          <p className="text-overline text-brand-ink">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm leading-relaxed text-white/60">{subtitle}</p>
          ) : null}

          <div className="mt-8">{children}</div>

          {footer ? <div className="mt-6">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
