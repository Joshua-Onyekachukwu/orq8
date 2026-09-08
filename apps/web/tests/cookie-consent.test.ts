import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getStoredConsent,
  storeConsent,
  clearConsent,
  COOKIE_CONSENT_KEY,
  isConsentValue,
} from "../lib/cookie-consent";

describe("cookie consent storage", () => {
  beforeEach(() => {
    localStorage.clear();
    document.cookie = `${COOKIE_CONSENT_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    vi.restoreAllMocks();
  });

  describe("isConsentValue", () => {
    it("accepts valid consent values", () => {
      expect(isConsentValue("essential")).toBe(true);
      expect(isConsentValue("functional")).toBe(true);
      expect(isConsentValue("all")).toBe(true);
    });

    it("rejects invalid values", () => {
      expect(isConsentValue("tracking")).toBe(false);
      expect(isConsentValue("ALL")).toBe(false);
      expect(isConsentValue("")).toBe(false);
      expect(isConsentValue(null)).toBe(false);
      expect(isConsentValue(undefined)).toBe(false);
      expect(isConsentValue(42)).toBe(false);
    });
  });

  describe("getStoredConsent", () => {
    it("returns null when nothing is stored", () => {
      expect(getStoredConsent()).toBeNull();
    });

    it("returns null for malformed stored values", () => {
      localStorage.setItem(COOKIE_CONSENT_KEY, "garbage");
      expect(getStoredConsent()).toBeNull();
    });

    it("round-trips a valid stored preference", () => {
      localStorage.setItem(COOKIE_CONSENT_KEY, "functional");
      expect(getStoredConsent()).toBe("functional");
    });
  });

  describe("storeConsent", () => {
    it("persists to localStorage and cookie", () => {
      expect(storeConsent("all")).toBe(true);
      expect(localStorage.getItem(COOKIE_CONSENT_KEY)).toBe("all");
      expect(document.cookie).toContain(`${COOKIE_CONSENT_KEY}=all`);
    });

    it("round-trips every consent value", () => {
      for (const value of ["essential", "functional", "all"] as const) {
        storeConsent(value);
        expect(getStoredConsent()).toBe(value);
      }
    });

    it("returns false when localStorage throws", () => {
      vi.spyOn(localStorage, "setItem").mockImplementation(() => {
        throw new Error("quota exceeded");
      });
      expect(storeConsent("all")).toBe(false);
      // The page must treat this as an error state, not silently lose consent
      expect(getStoredConsent()).toBeNull();
    });

    it("still reports failure even if only the cookie write throws", () => {
      const original = document.cookie;
      Object.defineProperty(document, "cookie", {
        get() {
          return original;
        },
        set() {
          throw new Error("cookies blocked");
        },
        configurable: true,
      });
      expect(storeConsent("essential")).toBe(false);
      Object.defineProperty(document, "cookie", {
        get() {
          return original;
        },
        set(v: string) {
          original; // restore default behavior below
        },
        configurable: true,
      });
    });
  });

  describe("clearConsent", () => {
    it("removes a stored preference so the banner shows again", () => {
      storeConsent("functional");
      expect(getStoredConsent()).toBe("functional");
      clearConsent();
      expect(getStoredConsent()).toBeNull();
    });

    it("is safe to call when nothing is stored", () => {
      expect(() => clearConsent()).not.toThrow();
      expect(getStoredConsent()).toBeNull();
    });
  });
});
