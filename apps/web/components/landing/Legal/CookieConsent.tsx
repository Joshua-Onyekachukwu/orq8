"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  getStoredConsent,
  storeConsent,
  type ConsentValue,
} from "@/lib/cookie-consent";

const CookieConsent: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent: ConsentValue | null = getStoredConsent();
    if (!consent) {
      setVisible(true);
    }
  }, []);

  function handleAcceptAll() {
    storeConsent("all");
    setVisible(false);
  }

  function handleEssentialOnly() {
    storeConsent("essential");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 z-[9999] p-[16px] md:p-[24px]"
    >
      <div className="mx-auto max-w-[800px] rounded-[16px] border border-white/10 bg-orq8-dark/95 backdrop-blur-xl p-[24px] md:p-[32px] shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-start gap-[16px] md:gap-[24px]">
          <div className="flex-1">
            <h3 className="text-white font-semibold text-[16px] mb-[8px]">
              🍪 Cookie Preferences
            </h3>
            <p className="text-white/50 text-sm leading-relaxed">
              We use essential cookies for authentication and security, and optional
              functional cookies to remember your preferences (like sidebar state and
              launcher position). We do not use advertising or tracking cookies.
            </p>
            <p className="text-white/40 text-xs mt-[8px]">
              <Link href="/privacy" className="underline hover:text-orq8-lime transition-colors">
                Privacy Policy
              </Link>{" "}
              ·{" "}
              <Link href="/settings/cookies" className="underline hover:text-orq8-lime transition-colors">
                Manage preferences
              </Link>
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-[8px] md:gap-[12px] shrink-0">
            <button
              onClick={handleEssentialOnly}
              className="px-[20px] py-[10px] rounded-full border border-white/20 text-white/70 text-sm font-medium hover:border-white/40 hover:text-white transition-colors"
            >
              Essential Only
            </button>
            <button
              onClick={handleAcceptAll}
              className="px-[20px] py-[10px] rounded-full bg-orq8-lime text-orq8-dark text-sm font-bold hover:brightness-110 transition-all"
            >
              Accept All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieConsent;
