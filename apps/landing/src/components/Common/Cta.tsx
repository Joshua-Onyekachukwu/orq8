"use client";

import React, { useState } from "react";

const Cta: React.FC = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "landing" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error?.message ?? "Could not sign you up — try again.");
        return;
      }
      setStatus("done");
      setMessage(
        data?.data?.already
          ? "You're already on the list — we'll be in touch."
          : "You're on the list. We'll email you when your cohort opens."
      );
    } catch {
      setStatus("error");
      setMessage("Network error — the waitlist service is unavailable.");
    }
  }

  return (
    <>
      <div id="waitlist" className="relative z-[1] pt-[60px]">
        <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
          <div className="rounded-[15px] dark:bg-black relative z-[1] py-[60px] md:py-[80px] lg:py-[100px] xl:py-[120px] px-[20px] md:px-[40px] lg:px-[60px] xl:px-[80px] text-center">
            <h2 className="!mb-[12px] md:!mb-[15px] !text-[26px] md:!text-3xl lg:!text-4xl">
              Your company, one decision away
            </h2>

            <p className="text-black dark:text-white lg:text-[15px] xl:text-md">
              Join the waitlist. The first cohort opens soon — we&apos;ll email
              you when it&apos;s your turn.
            </p>

            <div className="max-w-[560px] mx-auto mt-[5px] md:mt-[15px] lg:mt-[25px]">
              {status === "done" ? (
                <div
                  role="status"
                  className="rounded-[50px] border border-lime bg-lime/10 text-black dark:text-white py-[14px] px-[24px] font-medium"
                >
                  {message}
                </div>
              ) : (
                <form
                  onSubmit={handleSubmit}
                  className="flex flex-col sm:flex-row gap-[10px] md:gap-[12px]"
                >
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    aria-label="Email address"
                    name="email"
                    autoComplete="email"
                    spellCheck={false}
                    className="flex-1 h-[52px] rounded-[50px] border border-[#d5d9e2] dark:border-gray-700 bg-white dark:bg-navy-900 px-[24px] text-sm md:text-base text-black dark:text-white outline-0 focus:border-primary-500"
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="btn-press inline-flex items-center justify-center gap-[12px] rounded-[50px] bg-orange-500 text-white font-bold uppercase text-xs tracking-[1.8px] px-[28px] h-[52px] hover:bg-primary-500 disabled:opacity-60"
                  >
                    {status === "loading" ? "Submitting…" : "Get early access"}
                    <i className="ri-arrow-right-up-line text-[20px]"></i>
                  </button>
                </form>
              )}
              {status === "error" && (
                <p role="alert" className="mt-[12px] text-red-500 text-sm">
                  {message}
                </p>
              )}
            </div>

            <ul className="mt-[15px] md:mt-[20px] lg:mt-[25px] lg:text-[15px] xl:text-md">
              <li className="mx-[10px] md:mx-[15px] ltr:first:ml-0 rtl:first:mr-0 ltr:last:mr-0 rtl:last:ml-0 inline-block relative ltr:pl-[15px] rtl:pr-[15px]">
                <span className="w-[6px] h-[6px] ltr:left-0 rtl:right-0 rounded-full bg-primary-500 absolute top-1/2 -translate-y-1/2"></span>
                No credit card required
              </li>

              <li className="mx-[10px] md:mx-[15px] ltr:first:ml-0 rtl:first:mr-0 ltr:last:mr-0 rtl:last:ml-0 inline-block relative ltr:pl-[15px] rtl:pr-[15px]">
                <span className="w-[6px] h-[6px] ltr:left-0 rtl:right-0 rounded-full bg-primary-500 absolute top-1/2 -translate-y-1/2"></span>
                Get set up in 5 minutes
              </li>

              <li className="mx-[10px] md:mx-[15px] ltr:first:ml-0 rtl:first:mr-0 ltr:last:mr-0 rtl:last:ml-0 inline-block relative ltr:pl-[15px] rtl:pr-[15px]">
                <span className="w-[6px] h-[6px] ltr:left-0 rtl:right-0 rounded-full bg-primary-500 absolute top-1/2 -translate-y-1/2"></span>
                Cancel anytime
              </li>
            </ul>

            <div
              className="absolute top-0 left-0 right-0 bottom-0 -z-[1] rounded-[15px] dark:hidden"
              style={{
                background:
                  "radial-gradient(49.42% 65.08% at 50% 100%, #FFF 0%, #BCD5CE 100%)",
              }}
            ></div>
          </div>
        </div>

        <div className="absolute bottom-0 h-[50%] left-0 right-0 -z-[1] bg-navy-950"></div>
      </div>
    </>
  );
};

export default Cta;
