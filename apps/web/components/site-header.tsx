import Link from "next/link";
import { Button } from "./button";

export function SiteHeader() {
  return (
    <header className="border-b border-hairline bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight text-navy-900">
          ORQ8
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
          <a href="/#how-it-works" className="transition-colors hover:text-ink">
            How it works
          </a>
          <Link href="/pricing" className="transition-colors hover:text-ink">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/pricing" className="text-muted transition-colors hover:text-ink">
            Sign in
          </Link>
          <Button href="/pricing" size="sm">
            Get started — free
          </Button>
        </div>
      </div>
    </header>
  );
}
