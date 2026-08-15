import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-hairline bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted sm:flex-row">
        <p>ORQ8 — The AI Organization Operating System</p>
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <a href="#" className="transition-colors hover:text-ink">About</a>
          <a href="#" className="transition-colors hover:text-ink">Docs</a>
          <Link className="transition-colors hover:text-ink" href="/pricing">Pricing</Link>
          <a href="#" className="transition-colors hover:text-ink">Privacy</a>
          <a href="#" className="transition-colors hover:text-ink">Terms</a>
          <a href="#" className="transition-colors hover:text-ink">Status</a>
        </nav>
        <p>© {new Date().getFullYear()} ORQ8. Built on a free, self-hosted, model-agnostic stack.</p>
      </div>
    </footer>
  );
}
