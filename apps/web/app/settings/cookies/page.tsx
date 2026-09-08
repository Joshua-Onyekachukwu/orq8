"use client";

import { useState, useEffect, useCallback } from "react";
import { SettingsShell } from "../../../components/settings-shell";
import {
  CheckCircle2,
  Cookie,
  Shield,
  SlidersHorizontal,
  Loader2,
  AlertCircle,
  Info,
} from "lucide-react";
import {
  getStoredConsent,
  storeConsent,
  clearConsent,
  type ConsentValue,
} from "../../../lib/cookie-consent";

const CATEGORY_COPY: Record<
  ConsentValue,
  { title: string; description: string; items: string[]; locked?: boolean }
> = {
  essential: {
    title: "Strictly necessary",
    description:
      "Required for ORQ8 to function. These keep you signed in and protect your account.",
    items: [
      "Session cookie (authentication)",
      "Security headers and CSRF protection",
    ],
    locked: true,
  },
  functional: {
    title: "Functional",
    description:
      "Remember your preferences so the app feels the same when you come back.",
    items: [
      "Sidebar state and navigation preferences",
      "Executive Agent launcher position",
      "Command palette history",
    ],
  },
  all: {
    title: "Everything else",
    description:
      "ORQ8 does not currently use advertising or tracking cookies. If that ever changes, this is where consent applies.",
    items: ["No advertising cookies", "No cross-site tracking"],
  },
};

export default function CookiePreferencesPage() {
  const [consent, setConsent] = useState<ConsentValue | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setConsent(getStoredConsent());
    setLoaded(true);
  }, []);

  const handleSave = useCallback(
    (value: ConsentValue) => {
      setSaving(true);
      setError(null);
      const ok = storeConsent(value);
      if (!ok) {
        setError(
          "Your browser blocked saving this preference. Check that cookies and site data are allowed for this site."
        );
        setSaving(false);
        return;
      }
      setConsent(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setSaving(false);
    },
    []
  );

  const handleReset = useCallback(() => {
    clearConsent();
    setConsent(null);
  }, []);

  const current: ConsentValue = consent ?? "essential";

  return (
    <SettingsShell
      title="Cookie preferences"
      description="Choose which cookies ORQ8 may use. You can change this at any time — changes apply immediately on this device."
    >
      <div className="max-w-3xl space-y-6">
        {/* Current status */}
        <div className="rounded-xl border border-hairline bg-white p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orq8-lime/10 text-orq8-green">
              <Cookie className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-ink">Current consent</h2>
              {!loaded ? (
                <p className="mt-1 text-sm text-muted">Reading saved preference…</p>
              ) : consent ? (
                <p className="mt-1 text-sm text-muted">
                  You last saved{" "}
                  <span className="font-medium text-ink">
                    {consent === "all"
                      ? "Accept all"
                      : consent === "functional"
                        ? "Essential + functional"
                        : "Essential only"}
                  </span>{" "}
                  on this device.
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  No preference saved yet. The consent banner will appear on your next
                  visit to the public site until you choose.
                </p>
              )}
              {consent && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-2 text-xs font-medium text-muted underline transition-colors hover:text-ink"
                >
                  Reset choice and show the banner again
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Consent options */}
        <div className="rounded-xl border border-hairline bg-white p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <SlidersHorizontal className="h-4 w-4 text-muted" />
            Your choice
          </h2>
          <p className="mt-1 text-sm text-muted">
            Pick the level of cookies you are comfortable with. You can change it here
            at any time.
          </p>

          <div className="mt-5 space-y-3">
            {(["essential", "functional", "all"] as const).map((value) => {
              const info = CATEGORY_COPY[value];
              const selected = current === value;
              return (
                <div
                  key={value}
                  className={`rounded-xl border p-4 transition-colors ${
                    selected
                      ? "border-orq8-green bg-orq8-green/5"
                      : "border-hairline bg-white hover:border-orq8-green/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-ink">{info.title}</p>
                        {info.locked && (
                          <span className="rounded-full bg-canvas px-2 py-0.5 font-mono text-3xs font-semibold uppercase tracking-wide text-muted">
                            Always on
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">{info.description}</p>
                      <ul className="mt-2 space-y-1">
                        {info.items.map((item) => (
                          <li
                            key={item}
                            className="flex items-center gap-1.5 text-xs text-muted"
                          >
                            <CheckCircle2 className="h-3 w-3 shrink-0 text-orq8-green" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSave(value)}
                      disabled={saving || selected}
                      className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:cursor-default ${
                        selected
                          ? "border border-orq8-green bg-orq8-green/10 text-orq8-green"
                          : "bg-orq8-green text-white hover:bg-orq8-green-dark disabled:opacity-60"
                      }`}
                    >
                      {selected ? "Selected" : "Choose"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="mt-6 flex items-center gap-3 border-t border-hairline pt-5">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-orq8-green">
                <CheckCircle2 className="h-4 w-4" /> Preference saved
              </span>
            )}
            {saving && (
              <span className="inline-flex items-center gap-1.5 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </span>
            )}
            <p className="ml-auto text-xs text-muted">
              Applies to this browser only.
            </p>
          </div>
        </div>

        {/* Learn more */}
        <div className="rounded-xl border border-hairline bg-white p-6 sm:p-8">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orq8-dark text-orq8-green">
              <Shield className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">
                How ORQ8 handles cookies
              </h2>
              <p className="mt-1 text-sm text-muted">
                ORQ8 uses only the cookies described above. We never sell personal
                data and never run third-party advertising trackers. Full details,
                including your GDPR and CCPA rights, are in our Privacy Policy.
              </p>
              <a
                href="/privacy"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-orq8-green transition-colors hover:text-orq8-green-dark"
              >
                Read the Privacy Policy →
              </a>
            </div>
          </div>
        </div>

        <p className="flex items-start gap-2 px-1 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Strictly necessary cookies cannot be disabled because the product cannot
          function without them — this is permitted under GDPR Art. 6(1)(b).
        </p>
      </div>
    </SettingsShell>
  );
}
