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
      <footer
        className="bg-cover bg-center bg-no-repeat relative z-[1] py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]"
        style={{
          backgroundImage: "url(/images/footer-bg.jpg)",
        }}
      >
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[25px] items-end">
            <div className="lg:max-w-[386px]">
              <Link href="/" className="inline-block mb-[15px] md:mb-[25px] lg:mb-[40px]">
                <span className="inline-flex items-center gap-[7px] text-[26px] font-bold tracking-[-1.4px] text-white">
                  ORQ8
                  <span className="w-[9px] h-[9px] rounded-full bg-lime inline-block"></span>
                </span>
              </Link>

              <h3 className="!text-white !font-light !text-[20px] md:!text-[22px] lg:!text-xl -tracking-[.44px] md:-tracking-[1px] lg:-tracking-[1.44px] !mb-[20px] lg:!mb-[25px]">
                Follow our journey and get invited when your cohort opens
              </h3>

              {status === "done" ? (
                <p role="status" className="text-lime font-medium">
                  You&apos;re on the list — we&apos;ll email you.
                </p>
              ) : status === "error" ? (
                <p role="alert" className="text-red-400 font-medium">
                  Signup failed — please try again.
                </p>
              ) : (
                <form onSubmit={handleSubscribe} className="relative">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="block h-[45px] md:h-[50px] border border-white/30 bg-white/20 w-full rounded-[50px] placeholder:text-white text-white px-[20px] md:px-[25px] outline-0 text-sm md:text-base"
                    placeholder="Your Email here"
                    aria-label="Email address"
                    name="email"
                    autoComplete="email"
                    spellCheck={false}
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="btn-press md:absolute md:top-[2px] ltr:md:right-[2px] rtl:md:left-[2px] inline-block rounded-[60px] bg-lime p-[7px] md:p-[5px] uppercase text-xs font-bold text-black tracking-[1px] md:tracking-[1.8px] hover:bg-primary-500 hover:text-white mt-[15px] md:mt-0 disabled:opacity-60"
                  >
                    <span className="ltr:ml-[15px] rtl:mr-[15px] ltr:md:ml-[20px] rtl:md:mr-[20px] flex items-center justify-center gap-[15px] md:gap-[20px]">
                      {status === "loading" ? "Subscribing…" : "Subscribe"}{" "}
                      <i className="ri-arrow-right-up-line w-[30px] md:w-[36px] h-[30px] md:h-[36px] rounded-full bg-white dark:bg-dark text-black dark:text-white flex items-center justify-center text-md"></i>
                    </span>
                  </button>
                </form>
              )}
            </div>

            <div className="lg:max-w-[325px] ltr:lg:ml-auto rtl:lg:mr-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-[13px] md:gap-[25px] lg:gap-[50px] xl:gap-[100px]">
                <ul>
                  <li className="mb-[13px] last:mb-0">
                    <Link
                      href="/pricing"
                      className="text-white transition-colors hover:text-lime md:text-[15px] lg:text-md md:-tracking-[0.46px] lg:-tracking-[0.96px]"
                    >
                      Pricing
                    </Link>
                  </li>
                  <li className="mb-[13px] last:mb-0">
                    <Link
                      href="/#features"
                      className="text-white transition-colors hover:text-lime md:text-[15px] lg:text-md md:-tracking-[0.46px] lg:-tracking-[0.96px]"
                    >
                      Platform
                    </Link>
                  </li>
                  <li className="mb-[13px] last:mb-0">
                    <Link
                      href="/#how-it-works"
                      className="text-white transition-colors hover:text-lime md:text-[15px] lg:text-md md:-tracking-[0.46px] lg:-tracking-[0.96px]"
                    >
                      How it works
                    </Link>
                  </li>
                  <li className="mb-[13px] last:mb-0">
                    <Link
                      href="/contact"
                      className="text-white transition-colors hover:text-lime md:text-[15px] lg:text-md md:-tracking-[0.46px] lg:-tracking-[0.96px]"
                    >
                      Contact
                    </Link>
                  </li>
                </ul>

                <ul>
                  <li className="mb-[13px] last:mb-0">
                    <Link
                      href="/#waitlist"
                      className="text-white transition-colors hover:text-lime md:text-[15px] lg:text-md md:-tracking-[0.46px] lg:-tracking-[0.96px]"
                    >
                      Join the waitlist
                    </Link>
                  </li>
                  <li className="mb-[13px] last:mb-0">
                    <Link
                      href="/about"
                      className="text-white transition-colors hover:text-lime md:text-[15px] lg:text-md md:-tracking-[0.46px] lg:-tracking-[0.96px]"
                    >
                      About
                    </Link>
                  </li>
                  <li className="mb-[13px] last:mb-0">
                    <Link
                      href="/#faq"
                      className="text-white transition-colors hover:text-lime md:text-[15px] lg:text-md md:-tracking-[0.46px] lg:-tracking-[0.96px]"
                    >
                      FAQ
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute -z-[1] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden lg:block">
          <span className="text-lime/30 text-[120px] font-bold tracking-[-4px]">
            ORQ8
          </span>
        </div>
      </footer>

      <div className="py-[25px] md:py-[30px] bg-navy-800 text-center">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <p className="font-medium text-[#b8b8b8]">
            © {new Date().getFullYear()}{" "}
            <span className="text-lime">ORQ8</span> — The AI Organization
            Operating System. Built by a company of one, running on ORQ8.
          </p>
        </div>
      </div>
    </>
  );
};

export default Footer;
