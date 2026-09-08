/**
 * Cookie consent storage — single source of truth for consent state.
 *
 * Used by:
 * - components/landing/Legal/CookieConsent.tsx (first-visit banner)
 * - app/settings/cookies/page.tsx (preferences page)
 *
 * Consent values:
 * - "essential"  — strictly necessary cookies only (authentication, security)
 * - "functional" — essential + functional cookies (sidebar state, launcher position)
 * - "all"        — accept all (ORQ8 currently sets no advertising/tracking cookies)
 *
 * Stored in localStorage AND a non-HttpOnly cookie of the same name so the
 * value survives both client and server reads for 365 days.
 */

export const COOKIE_CONSENT_KEY = "orq8_cookie_consent";
export const COOKIE_CONSENT_EXPIRY_DAYS = 365;

export type ConsentValue = "essential" | "functional" | "all";

export const CONSENT_VALUES: ConsentValue[] = ["essential", "functional", "all"];

export function isConsentValue(value: unknown): value is ConsentValue {
  return typeof value === "string" && (CONSENT_VALUES as string[]).includes(value);
}

/** Read the stored consent. Returns null when unset or malformed. */
export function getStoredConsent(): ConsentValue | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(COOKIE_CONSENT_KEY);
    return isConsentValue(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Persist consent to localStorage + cookie.
 * Returns false when storage is unavailable (private mode, quota, blocked).
 */
export function storeConsent(value: ConsentValue): boolean {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + COOKIE_CONSENT_EXPIRY_DAYS);
    document.cookie = `${COOKIE_CONSENT_KEY}=${value}; expires=${expiry.toUTCString()}; path=/; SameSite=Lax`;
    return true;
  } catch {
    return false;
  }
}

/** Clear stored consent (re-shows the banner on next landing visit). */
export function clearConsent(): void {
  try {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    document.cookie = `${COOKIE_CONSENT_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  } catch {
    // storage unavailable — nothing to clear
  }
}
