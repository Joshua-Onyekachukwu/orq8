import Link from "next/link";
import { Button } from "./button";

type HeaderProps = {
  variant?: "light" | "navy";
  cta?: { href: string; label: string };
};

export function SiteHeader({ variant = "light", cta }: HeaderProps) {
  const navy = variant === "navy";
  return (
    <header className={navy ? "border-b border-white/10" : "border-b border-hairline bg-white"}>
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className={`text-lg font-semibold tracking-tight ${navy ? "text-white" : "text-navy-900"}`}
        >
          ORQ8
        </Link>
        <nav className={`hidden items-center gap-6 text-sm sm:flex ${navy ? "text-white/70" : "text-muted"}`}>
          <a href="/#how-it-works" className="transition-colors hover:text-white">
            How it works
          </a>
          <Link href="/pricing" className="transition-colors hover:text-white">
            Pricing
          </Link>
          <a href="/#waitlist" className="transition-colors hover:text-white">
            Waitlist
          </a>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/login"
            className={navy ? "text-white/70 transition-colors hover:text-white" : "text-muted transition-colors hover:text-ink"}
          >
            Sign in
          </Link>
          {cta ? (
            <Button href={cta.href} size="sm" variant={navy ? "outline-light" : "default"}>
              {cta.label}
            </Button>
          ) : (
            <Button href="/register" size="sm">
              Get started — free
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
