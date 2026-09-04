"use client";

import React, { useState } from "react";

const Cta: React.FC = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
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
        setMessage(data?.error?.message ?? "Could not sign you up. Try again.");
        return;
      }
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div id="waitlist" className="relative z-[1] py-[80px] md:py-[120px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1200px] mx-auto px-[20px] md:px-[24px]">
        <div className="relative overflow-hidden rounded-[20px] bg-[#0A0A0B] border border-white/[0.06]">
          {/* Grid texture */}
          <div className="absolute inset-0 opacity-[0.02]" style={{backgroundImage:"linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",backgroundSize:"40px 40px"}} />

          <div className="relative z-[1] px-[24px] md:px-[60px] lg:px-[80px] py-[50px] md:py-[70px] lg:py-[90px] text-center">
            {status === "done" ? (
              /* ── Success State ── */
              <div className="max-w-lg mx-auto">
                <div className="mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[#B8FF66]/10 border border-[#B8FF66]/20">
                  <svg className="h-[36px] w-[36px] text-[#B8FF66]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <h2 className="!text-white !mb-[12px] !text-[28px] md:!text-[32px] lg:!text-[40px]">
                  You&apos;re on the list
                </h2>
                <p className="text-white/60 lg:text-[16px] leading-relaxed !mb-[20px]">
                  We&apos;ve saved your spot. When your cohort opens, you&apos;ll receive an email with next steps.
                </p>
                <div className="inline-flex items-center gap-[8px] rounded-full bg-[#B8FF66]/10 border border-[#B8FF66]/20 px-[20px] py-[10px]">
                  <span className="h-[6px] w-[6px] rounded-full bg-[#B8FF66] animate-pulse" />
                  <span className="text-[12px] font-medium text-[#B8FF66]">First Cohort · Priority Access</span>
                </div>
              </div>
            ) : (
              <>
                {/* Badge */}
                <span className="inline-block py-[6px] px-[14px] font-bold text-[10px] bg-[#B8FF66]/10 border border-[#B8FF66]/20 rounded-full text-[#B8FF66] tracking-[0.15em] uppercase mb-[24px]">
                  Join the first cohort
                </span>

                <h2 className="!text-white !mb-[16px] md:!mb-[20px] !text-[28px] md:!text-[36px] lg:!text-[44px] -tracking-[0.5px] md:-tracking-[1px]">
                  Your Company of One,<br className="hidden sm:block" /> one decision away
                </h2>

                <p className="max-w-[480px] mx-auto text-white/50 lg:text-[16px] leading-relaxed">
                  The first cohort opens soon. We&apos;ll email you when it&apos;s your turn to build your AI organization.
                </p>

                <div className="max-w-[520px] mx-auto mt-[32px] md:mt-[40px]">
                  <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-[12px]">
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
                      className="flex-1 h-[52px] rounded-full border border-white/15 bg-white/[0.03] px-[24px] text-[15px] text-white placeholder:text-white/30 outline-0 focus:border-[#B8FF66] focus:bg-white/[0.05] transition-colors"
                    />
                    <button
                      type="submit"
                      disabled={status === "loading"}
                      className="btn-press inline-flex items-center justify-center gap-[10px] rounded-full bg-[#E86A33] text-white font-bold uppercase text-[11px] tracking-[0.15em] px-[28px] h-[52px] hover:bg-[#d45e2a] disabled:opacity-60 transition-colors"
                    >
                      {status === "loading" ? (
                        <>
                          <span className="h-[14px] w-[14px] animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Joining...
                        </>
                      ) : (
                        <>
                          Join waitlist
                          <i className="ri-arrow-right-up-line text-[16px]" />
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <ul className="mt-[20px] md:mt-[24px] flex flex-wrap justify-center gap-x-[24px] gap-y-[10px]">
                  {["7 days free on every plan", "Priority access when the cohort opens", "Leave the list any time"].map((item) => (
                    <li key={item} className="flex items-center gap-[8px] text-[13px] text-white/40">
                      <span className="w-[5px] h-[5px] rounded-full bg-[#B8FF66]/60 shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>

                {status === "error" && (
                  <div className="mt-[16px] inline-flex items-center gap-[8px] rounded-full bg-red-500/10 border border-red-500/20 px-[16px] py-[10px]">
                    <svg className="h-[14px] w-[14px] text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span className="text-red-400 text-[13px]">{message}</span>
                  </div>
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
