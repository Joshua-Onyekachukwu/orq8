import Link from "next/link";

export function SiteFooter({ variant = "light" }: { variant?: "light" | "dark" }) {
  if (variant === "dark") {
    return (
      <footer className="border-t border-white/8 bg-navy-900">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-fog sm:flex-row">
          <p className="text-parchment">ORQ8</p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <a href="/#how-it-works" className="transition-colors hover:text-emerald">How it works</a>
            <a href="/#features" className="transition-colors hover:text-emerald">Platform</a>
            <a href="/#organization" className="transition-colors hover:text-emerald">The organization</a>
            <Link href="/pricing" className="transition-colors hover:text-emerald">Pricing</Link>
            <a href="/#start" className="transition-colors hover:text-emerald">Join the waitlist</a>
          </nav>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fog">
            © {new Date().getFullYear()} ORQ8.
          </p>
        </div>
        <p className="pb-8 text-center text-sm italic text-fog">
          Built by a company of one, running on ORQ8.
        </p>
      </footer>
    );
  }

  return (
    <footer className="border-t border-hairline bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted sm:flex-row">
        <p>ORQ8 — The AI Organization Operating System</p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href="/#start" className="transition-colors hover:text-ink">About</a>
          <a href="/#how-it-works" className="transition-colors hover:text-ink">How it works</a>
          <Link className="transition-colors hover:text-ink" href="/pricing">Pricing</Link>
          <a href="/#organization" className="transition-colors hover:text-ink">The organization</a>
          <a href="/#start" className="transition-colors hover:text-ink">Join the waitlist</a>
        </nav>
        <p>© {new Date().getFullYear()} ORQ8. Built on a free, self-hosted, model-agnostic stack.</p>
      </div>
    </footer>
  );
}
