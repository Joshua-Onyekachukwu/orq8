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
      <footer className="relative z-[1] bg-navy-950 pt-[70px] md:pt-[90px] lg:pt-[110px] overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage:
              "radial-gradient(70% 70% at 50% 0%, black, transparent 90%)",
            WebkitMaskImage:
              "radial-gradient(70% 70% at 50% 0%, black, transparent 90%)",
          }}
        ></div>

        <div className="relative container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[40px] lg:gap-[60px] pb-[50px] md:pb-[70px]">
            {/* Brand + waitlist */}
            <div>
              <Link
                href="/"
                className="inline-block mb-[18px] md:mb-[25px]"
                aria-label="ORQ8 home"
              >
                <span className="inline-flex items-center gap-[8px] text-[26px] font-bold tracking-[-1.4px] text-white">
                  ORQ8
                  <span className="w-[9px] h-[9px] rounded-full bg-lime inline-block"></span>
                </span>
              </Link>

              <h3 className="!text-white !font-light !text-[20px] md:!text-[22px] lg:!text-2xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[10px] lg:!mb-[14px] !max-w-[420px] !leading-[1.3]">
                Follow our journey and get invited when your cohort opens
              </h3>
              <p className="text-white/60 text-sm md:text-[15px] !mb-[20px] md:!mb-[28px] !max-w-[420px]">
                One founder. A company that runs itself. First cohort opens
                soon.
              </p>

              {status === "done" ? (
                <p role="status" className="text-lime font-medium">
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
                    className="block h-[52px] border border-white/20 bg-white/10 w-full rounded-[50px] placeholder:text-white/50 text-white px-[22px] md:px-[25px] outline-0 text-sm md:text-base focus:border-lime transition-colors"
                    placeholder="Your email here"
                    aria-label="Email address"
                    name="email"
                    autoComplete="email"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="btn-press md:absolute md:top-[3px] ltr:md:right-[3px] rtl:md:left-[3px] inline-block rounded-[50px] bg-lime p-[7px] md:p-[6px] uppercase text-xs font-bold text-navy-950 tracking-[1px] md:tracking-[1.8px] hover:bg-primary-500 hover:text-white mt-[15px] md:mt-0 disabled:opacity-60"
                  >
                    <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                      {status === "loading" ? "Joining…" : "Join the waitlist"}{" "}
                      <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                    </span>
                  </button>
                </form>
              )}
            </div>

            {/* Link columns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-[30px] lg:gap-[40px] lg:ltr:justify-end lg:rtl:justify-start">
              <div>
                <span className="block uppercase font-bold tracking-[1.8px] text-xs text-white/40 mb-[18px] md:mb-[24px]">
                  Product
                </span>
                <ul className="space-y-[12px] md:space-y-[14px]">
                  <li>
                    <Link
                      href="/#features"
                      className="text-white/85 transition-colors hover:text-lime md:text-[15px]"
                    >
                      Platform
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#how-it-works"
                      className="text-white/85 transition-colors hover:text-lime md:text-[15px]"
                    >
                      How it works
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/pricing"
                      className="text-white/85 transition-colors hover:text-lime md:text-[15px]"
                    >
                      Pricing
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <span className="block uppercase font-bold tracking-[1.8px] text-xs text-white/40 mb-[18px] md:mb-[24px]">
                  Company
                </span>
                <ul className="space-y-[12px] md:space-y-[14px]">
                  <li>
                    <Link
                      href="/about"
                      className="text-white/85 transition-colors hover:text-lime md:text-[15px]"
                    >
                      About
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/contact"
                      className="text-white/85 transition-colors hover:text-lime md:text-[15px]"
                    >
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#faq"
                      className="text-white/85 transition-colors hover:text-lime md:text-[15px]"
                    >
                      FAQ
                    </Link>
                  </li>
                </ul>
              </div>

              <div>
                <span className="block uppercase font-bold tracking-[1.8px] text-xs text-white/40 mb-[18px] md:mb-[24px]">
                  Next steps
                </span>
                <ul className="space-y-[12px] md:space-y-[14px]">
                  <li>
                    <Link
                      href="/#waitlist"
                      className="text-white/85 transition-colors hover:text-lime md:text-[15px]"
                    >
                      Join the waitlist
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="relative border-t border-white/10 py-[25px] md:py-[28px] flex flex-col md:flex-row items-center justify-between gap-[14px]">
            <p className="text-sm text-white/50 !mb-0">
              © {new Date().getFullYear()}{" "}
              <span className="text-lime font-medium">ORQ8</span>. The AI
              Organization Operating System.
            </p>
            <p className="text-sm text-white/50 !mb-0">
              Built by a company of one, running on ORQ8.
            </p>
          </div>
        </div>
      </footer>
    </>
  );
};

export default Footer;
