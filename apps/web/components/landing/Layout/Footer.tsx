"use client";

import React, { useState } from "react";
import Link from "next/link";

const Footer: React.FC = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );

  async function handleSubscribe(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "footer" }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <footer className="relative z-[1] ink pt-[80px] md:pt-[100px] lg:pt-[120px] overflow-hidden">
        {/* Subtle grid texture */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "60px 60px",
          }}
        />

        <div className="relative container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1200px] mx-auto px-[20px] md:px-[24px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[48px] lg:gap-[60px] pb-[60px] md:pb-[80px]">
            {/* Brand + waitlist */}
            <div>
              <Link
                href="/"
                className="inline-block mb-[20px] md:mb-[28px]"
                aria-label="ORQ8 home"
              >
                <span className="inline-flex items-center gap-[8px] text-[26px] font-bold tracking-[-1.4px] text-white">
                  ORQ8
                  <span className="w-[9px] h-[9px] rounded-full bg-ink-accent inline-block"></span>
                </span>
              </Link>

              <h3 className="!text-white !font-normal !text-xl md:!text-[24px] lg:!text-[28px] -tracking-[0.5px] !mb-[12px] lg:!mb-[16px] !max-w-[420px] !leading-[1.3]">
                Follow our journey and get invited when your cohort opens
              </h3>
              <p className="text-white/50 text-sm md:text-md !mb-[24px] md:!mb-[32px] !max-w-[420px]">
                One founder. A company that runs itself. First cohort opens
                soon.
              </p>

              {status === "done" ? (
                <div
                  role="status"
                  className="flex max-w-[440px] items-center gap-[12px] rounded-[14px] border border-ink-accent/25 bg-ink-accent/[0.07] px-[18px] py-[14px]"
                >
                  <span className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-full bg-ink-accent text-ink-surface">
                    <i className="ri-check-line text-base"></i>
                  </span>
                  <span className="text-sm text-white/80">
                    You&apos;re on the list. We&apos;ll email you when your
                    cohort opens.
                  </span>
                </div>
              ) : (
                <form onSubmit={handleSubscribe} className="max-w-[440px]">
                  {/* One physical field. The input and its action share a single
                      surface, so the form reads as one control rather than an
                      input with a detached button floating beside it. */}
                  <div className="flex items-center gap-[8px] rounded-full border border-white/[0.10] bg-white/[0.04] p-[6px] transition-colors focus-within:border-ink-accent/70 focus-within:bg-white/[0.07]">
                    <span
                      className="ltr:pl-[14px] rtl:pr-[14px] text-white/35"
                      aria-hidden="true"
                    >
                      <i className="ri-mail-line text-base"></i>
                    </span>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-[42px] min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-0"
                      placeholder="you@company.com"
                      aria-label="Email address"
                      name="email"
                      autoComplete="email"
                      spellCheck={false}
                    />
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="btn-press inline-flex h-[42px] flex-none items-center justify-center gap-[8px] rounded-full bg-ink-accent px-[18px] uppercase text-overline font-bold tracking-[0.15em] text-ink-surface transition-all hover:bg-white disabled:opacity-60"
                    >
                      {status === "loading" ? (
                        <>
                          <span className="h-[13px] w-[13px] animate-spin rounded-full border-2 border-ink-surface/30 border-t-ink-surface" />
                          <span className="hidden sm:inline">Joining…</span>
                        </>
                      ) : (
                        <>
                          <span className="hidden sm:inline">Join the waitlist</span>
                          <span className="sm:hidden">Join</span>
                          <i className="ri-arrow-right-up-line text-base"></i>
                        </>
                      )}
                    </button>
                  </div>

                  {status === "error" ? (
                    <p
                      role="alert"
                      className="mt-[10px] flex items-center gap-[8px] text-xs text-red-400 !mb-0"
                    >
                      <i className="ri-error-warning-line text-sm"></i>
                      Signup failed. Please try again.
                    </p>
                  ) : (
                    <p className="mt-[12px] flex items-center gap-[8px] text-xs text-white/40 !mb-0">
                      <i className="ri-shield-check-line text-sm text-ink-accent"></i>
                      No spam. One email when your cohort opens.
                    </p>
                  )}
                </form>
              )}
            </div>

            {/* Link columns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-[32px] lg:gap-[40px] lg:ltr:justify-end lg:rtl:justify-start">
              <div>
                <span className="block uppercase font-bold tracking-[0.15em] text-overline text-white/40 mb-[20px] md:mb-[24px]">
                  Product
                </span>
                <ul className="space-y-[14px] md:space-y-[16px]">
                  <li>
                    <Link
                      href="/#features"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      Platform
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#how-it-works"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      How it works
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/pricing"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      Pricing
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <span className="block uppercase font-bold tracking-[0.15em] text-overline text-white/40 mb-[20px] md:mb-[24px]">
                  Company
                </span>
                <ul className="space-y-[14px] md:space-y-[16px]">
                  <li>
                    <Link
                      href="/about"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      About
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/contact"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#faq"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      FAQ
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <span className="block uppercase font-bold tracking-[0.15em] text-overline text-white/40 mb-[20px] md:mb-[24px]">
                  Legal
                </span>
                <ul className="space-y-[14px] md:space-y-[16px]">
                  <li>
                    <Link
                      href="/privacy"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      Privacy Policy
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/terms"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      Terms of Service
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/security"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      Security
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/ai-disclosure"
                      className="text-white/70 transition-colors hover:text-ink-accent text-md"
                    >
                      AI Transparency
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="relative border-t border-white/[0.06] py-[28px] md:py-[32px] flex flex-col md:flex-row items-center justify-between gap-[16px]">
            <p className="text-sm text-white/40 !mb-0">
              © {new Date().getFullYear()}{" "}
              <span className="text-ink-accent font-medium">ORQ8</span>. The AI
              Organization Operating System.
            </p>
            <p className="text-sm text-white/40 !mb-0">
              Built by a company of one, running on ORQ8.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
};

export default Footer;
