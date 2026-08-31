"use client";

import React, { useState, useMemo } from "react";

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return 1000 + Math.abs(h % 9000);
}

const Cta: React.FC = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [isAlready, setIsAlready] = useState(false);

  const waitlistNumber = useMemo(() => {
    return submittedEmail ? seededRandom(submittedEmail) : null;
  }, [submittedEmail]);

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
        setMessage(data?.error?.message ?? "Could not sign you up. Try again.");
        return;
      }
      setSubmittedEmail(email);
      setIsAlready(data?.data?.already === true);
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Network error. The waitlist service is unavailable.");
    }
  }

  return (
    <div id="waitlist" className="relative z-[1] pt-[60px] pb-[80px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        <div className="relative overflow-hidden rounded-[24px] bg-navy-950 border border-white/10">
          {/* Decorative background elements */}
          <div className="absolute inset-0 z-0">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-lime blur-[120px] opacity-[0.06]" />
            <div className="absolute bottom-0 right-0 w-[400px] h-[200px] bg-primary-500 blur-[100px] opacity-[0.08]" />
            <div
              aria-hidden
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
          </div>

          <div className="relative z-[1] px-[24px] md:px-[60px] lg:px-[80px] py-[50px] md:py-[70px] lg:py-[90px] text-center">
            {status === "done" && waitlistNumber ? (
              <div className="max-w-lg mx-auto">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-lime/10 animate-fade-in">
                  <svg className="h-8 w-8 text-lime" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="!text-white !mb-[8px] !text-[26px] md:!text-3xl lg:!text-4xl">
                  {isAlready ? "You're already on the list" : "You're officially on the list"}
                </h2>
                <div className="my-6">
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] mb-2 text-white/50">Your place</p>
                  <p className="text-5xl font-bold tracking-tight tabular-nums text-white animate-fade-in">
                    #{waitlistNumber.toLocaleString()}
                  </p>
                </div>
                <p className="text-white lg:text-[15px] xl:text-md leading-relaxed">
                  {isAlready
                    ? "We have your details. We'll be in touch when your cohort opens."
                    : "Congratulations. We're building ORQ8 for you. Your place in the first cohort is reserved. We'll email you when it's your turn."}
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 text-xs font-medium text-lime">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime animate-pulse"></span>
                  <span>Company of One · First Cohort</span>
                </div>
              </div>
            ) : (
              <>
                {/* Badge */}
                <span className="inline-block py-[6px] px-[14px] font-bold text-[10px] bg-lime/10 border border-lime/20 rounded-[8px] text-lime tracking-[1.8px] uppercase mb-[20px]">
                  Join the first cohort
                </span>

                <h2 className="!text-white !mb-[12px] md:!mb-[15px] !text-[26px] md:!text-3xl lg:!text-[40px] xl:!text-[46px] -tracking-[1px] md:-tracking-[2px] lg:-tracking-[2.5px]">
                  Your Company of One,<br className="hidden sm:block" /> one decision away
                </h2>

                <p className="max-w-[480px] mx-auto text-white/60 lg:text-[15px] xl:text-md leading-relaxed">
                  The first cohort opens soon. We&apos;ll email you when it&apos;s your turn to build your AI organization.
                </p>

                <div className="max-w-[520px] mx-auto mt-[24px] md:mt-[32px]">
                  <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-[10px] md:gap-[12px]">
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
                      className="flex-1 h-[52px] rounded-[50px] border border-white/15 bg-white/5 px-[24px] text-sm md:text-base text-white placeholder:text-white/30 outline-0 focus:border-lime focus:bg-white/10 transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="btn-press inline-flex items-center justify-center gap-[10px] rounded-[50px] bg-lime text-navy-950 font-bold uppercase text-xs tracking-[1.8px] px-[28px] h-[52px] hover:bg-emerald disabled:opacity-60 transition-colors"
                    >
                      {status === "loading" ? "Joining..." : "Join waitlist"}
                      <i className="ri-arrow-right-up-line text-[18px]"></i>
                    </button>
                  </form>
                </div>

                <ul className="mt-[16px] md:mt-[20px] flex flex-wrap justify-center gap-x-[20px] gap-y-[8px]">
                  {[
                    "7 days free on every plan",
                    "Priority access when the cohort opens",
                    "Leave the list any time",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-[6px] text-[13px] text-white/50">
                      <span className="w-[5px] h-[5px] rounded-full bg-lime/60 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                {status === "error" && (
                  <p role="alert" className="mt-[12px] text-red-400 text-sm">{message}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Cta;
