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
      <footer className="relative z-[1] bg-orq8-dark pt-[80px] md:pt-[100px] lg:pt-[120px] overflow-hidden">
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
                  <span className="w-[9px] h-[9px] rounded-full bg-orq8-lime inline-block"></span>
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
                <p role="status" className="text-orq8-lime font-medium">
                  You&apos;re on the list. We&apos;ll email you.
                </p>
              ) : status === "error" ? (
                <p role="alert" className="text-red-400 font-medium">
                  Signup failed. Please try again.
                </p>
              ) : (
                <form
                  onSubmit={handleSubscribe}
                  className="relative max-w-[440px]"
                >
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block h-[48px] border border-white/[0.08] bg-white/[0.03] w-full rounded-full placeholder:text-white/30 text-white px-[20px] outline-0 text-sm focus:border-orq8-lime transition-colors"
                    placeholder="Your email here"
                    aria-label="Email address"
                    name="email"
                    autoComplete="email"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="btn-press md:absolute md:top-[3px] ltr:md:right-[3px] rtl:md:left-[3px] inline-block rounded-full bg-orq8-lime p-[6px] md:p-[6px] uppercase text-[11px] font-bold text-orq8-dark tracking-[0.15em] hover:bg-orq8-lime mt-[12px] md:mt-0 disabled:opacity-60 transition-colors"
                  >
                    <span className="flex items-center justify-center gap-[10px]">
                      {status === "loading" ? "Joining…" : "Join the waitlist"}{" "}
                      <i className="ri-arrow-right-up-line w-[24px] h-[24px] rounded-full bg-orq8-dark/10 text-orq8-dark flex items-center justify-center text-xs"></i>
                    </span>
                  </button>
                </form>
              )}
            </div>

            {/* Link columns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-[32px] lg:gap-[40px] lg:ltr:justify-end lg:rtl:justify-start">
              <div>
                <span className="block uppercase font-bold tracking-[0.15em] text-[11px] text-white/40 mb-[20px] md:mb-[24px]">
                  Product
                </span>
                <ul className="space-y-[14px] md:space-y-[16px]">
                  <li>
                    <Link
                      href="/#features"
                      className="text-white/70 transition-colors hover:text-orq8-lime text-md"
                    >
                      Platform
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#how-it-works"
                      className="text-white/70 transition-colors hover:text-orq8-lime text-md"
                    >
                      How it works
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/pricing"
                      className="text-white/70 transition-colors hover:text-orq8-lime text-md"
                    >
                      Pricing
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <span className="block uppercase font-bold tracking-[0.15em] text-[11px] text-white/40 mb-[20px] md:mb-[24px]">
                  Company
                </span>
                <ul className="space-y-[14px] md:space-y-[16px]">
                  <li>
                    <Link
                      href="/about"
                      className="text-white/70 transition-colors hover:text-orq8-lime text-md"
                    >
                      About
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/contact"
                      className="text-white/70 transition-colors hover:text-orq8-lime text-md"
                    >
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#faq"
                      className="text-white/70 transition-colors hover:text-orq8-lime text-md"
                    >
                      FAQ
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <span className="block uppercase font-bold tracking-[0.15em] text-[11px] text-white/40 mb-[20px] md:mb-[24px]">
                  Next steps
                </span>
                <ul className="space-y-[14px] md:space-y-[16px]">
                  <li>
                    <Link
                      href="/#waitlist"
                      className="text-white/70 transition-colors hover:text-orq8-lime text-md"
                    >
                      Join the waitlist
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
              <span className="text-orq8-lime font-medium">ORQ8</span>. The AI
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
