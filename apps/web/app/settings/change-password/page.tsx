"use client";

import { useState } from "react";
import { SettingsShell } from "../../../components/settings-shell";

const fieldClass =
  "h-11 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-orq8-green";

const labelClass = "mb-1.5 block text-sm font-medium text-ink";

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    if (!current || !next || next !== confirm) {
      if (next !== confirm) setError("New passwords do not match");
      return;
    }
    if (next.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: current,
          new_password: next,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }
      setSaved(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsShell
      title="Change password"
      description="Rotate your sign-in password. Your session stays active on every device."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="max-w-lg rounded-xl border border-hairline bg-white p-6 sm:p-8"
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="current" className={labelClass}>
              Current password
            </label>
            <input
              id="current"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={fieldClass}
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <label htmlFor="next" className={labelClass}>
              New password
            </label>
            <input
              id="next"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={fieldClass}
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div>
            <label htmlFor="confirm" className={labelClass}>
              Confirm new password
            </label>
            <input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={fieldClass}
              placeholder="Repeat the new password"
              required
            />
          </div>
        </div>

        {error && (
          <p className="mt-4 text-sm font-medium text-red-600">{error}</p>
        )}

        <div className="mt-8 flex items-center gap-4 border-t border-hairline pt-6">
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-orq8-dark px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orq8-lime hover:text-white disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update password"}
          </button>
          {saved && (
            <span role="status" className="text-sm font-medium text-orq8-green">
              Password updated
            </span>
          )}
        </div>
      </form>
    </SettingsShell>
  );
}
