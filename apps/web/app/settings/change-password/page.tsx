"use client";

import { useState } from "react";
import { SettingsShell } from "../../../components/settings-shell";

const fieldClass =
  "h-11 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy-800";

const labelClass = "mb-1.5 block text-sm font-medium text-ink";

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = () => {
    // Sample only: real password rotation lands with the members API.
    if (!current || !next || next !== confirm) return;
    setSaved(true);
    setCurrent("");
    setNext("");
    setConfirm("");
    setTimeout(() => setSaved(false), 3000);
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
            />
          </div>
        </div>

        <div className="mt-8 flex items-center gap-4 border-t border-hairline pt-6">
          <button
            type="submit"
            className="rounded-full bg-navy-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950"
          >
            Update password
          </button>
          {saved && (
            <span role="status" className="text-sm font-medium text-emerald-700">
              Password updated
            </span>
          )}
        </div>
        <p className="mt-4 font-mono text-[10px] uppercase tracking-wide text-muted">
          Wires to the members API in Phase 2
        </p>
      </form>
    </SettingsShell>
  );
}
