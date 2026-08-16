import Link from "next/link";
import { Button } from "./button";

type HeaderProps = {
  variant?: "light" | "navy" | "dark";
  cta?: { href: string; label: string };
};

export function SiteHeader({ variant = "light", cta }: HeaderProps) {
  const navy = variant === "navy";
  const dark = variant === "dark";
  const onDark = navy || dark;

  const nav = [
    { href: "/#how-it-works", label: "How it works" },
    { href: "/#features", label: "Platform" },
    { href: "/#organization", label: "The organization" },
    { href: "/pricing", label: "Pricing" },
  ];

  return (
    <header
      className={
        dark
          ? "border-b border-white/8 bg-transparent"
          : navy
            ? "sticky top-0 z-50 border-b border-white/10 bg-navy-950/80 backdrop-blur-md"
            : "border-b border-hairline bg-white"
      }
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          href="/"
          className={`flex items-baseline gap-1.5 text-lg font-semibold tracking-tight ${
            dark ? "text-parchment" : navy ? "text-white" : "text-navy-900"
          }`}
        >
          ORQ8
          <span className={`font-mono text-[10px] uppercase tracking-[0.2em] ${navy ? "text-emerald" : "text-amber"}`}>
            {navy ? "· os" : ""}
          </span>
        </Link>
        <nav
          className={`hidden items-center gap-7 text-sm lg:flex ${
            dark ? "text-fog" : navy ? "text-white/70" : "text-muted"
          }`}
        >
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="transition-colors hover:text-emerald">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/login"
            className={
              dark
                ? "text-fog transition-colors hover:text-parchment"
                : navy
                  ? "text-white/70 transition-colors hover:text-white"
                  : "text-muted transition-colors hover:text-ink"
            }
          >
            Sign in
          </Link>
          {cta ? (
            <Button href={cta.href} size="sm" variant={navy ? "emerald" : dark ? "amber" : "default"}>
              {cta.label}
            </Button>
          ) : (
            <Button href="/register" size="sm" variant={navy ? "emerald" : dark ? "amber" : "default"}>
              Get started free
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
