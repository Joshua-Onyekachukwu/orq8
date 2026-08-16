"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Mail, UserPlus } from "lucide-react";

/**
 * Forms: the left column is the element gallery (inputs, selects, checks,
 * radios, switches); the right column composes the same elements into a
 * real ORQ8 flow: hiring an agent (Phase 2).
 */
const fieldClass =
  "h-11 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy-800";
const labelClass = "mb-1.5 block text-sm font-medium text-ink";

const roleTemplates = [
  { name: "Market researcher", dept: "Marketing", cost: "$12/wk" },
  { name: "Content writer", dept: "Marketing", cost: "$10/wk" },
  { name: "Software engineer", dept: "Engineering", cost: "$18/wk" },
  { name: "Operations analyst", dept: "Operations", cost: "$9/wk" },
];

function CheckboxRow({ label, hint, disabled }: { label: string; hint?: string; disabled?: boolean }) {
  return (
    <label
      className={`flex items-start gap-2.5 text-sm ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <input
        type="checkbox"
        defaultChecked={!disabled}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 rounded border-hairline accent-emerald"
      />
      <span>
        <span className="font-medium text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export default function FormsPage() {
  const [approval, setApproval] = useState("auto");
  const [reportWeekly, setReportWeekly] = useState(true);
  const [hired, setHired] = useState<string | null>(null);
  const [hiring, setHiring] = useState(false);

  const hire = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Read the form synchronously: React nulls e.currentTarget after the
    // handler returns, so the timeout below cannot touch it.
    const name = String(new FormData(e.currentTarget).get("agent_name") ?? "New agent");
    setHiring(true);
    setTimeout(() => {
      setHiring(false);
      setHired(name);
    }, 900);
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
          UI Kit · Form elements
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Forms</h1>
        <p className="mt-1 text-sm text-muted">
          The building blocks of every ORQ8 form, then composed into a real
          flow: hiring an agent.
        </p>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Element gallery */}
        <div className="space-y-6">
          <section className="rounded-xl border border-hairline bg-white p-6">
            <h2 className="text-sm font-semibold text-ink">Text inputs</h2>
            <div className="mt-4 space-y-4">
              <div>
                <label htmlFor="basic-input" className={labelClass}>
                  Basic input
                </label>
                <input id="basic-input" type="text" className={fieldClass} placeholder="Your name" />
              </div>
              <div>
                <label htmlFor="icon-input" className={labelClass}>
                  Input with icon
                </label>
                <span className="relative block">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    id="icon-input"
                    type="email"
                    className={`${fieldClass} pl-9`}
                    placeholder="you@company.com"
                  />
                </span>
              </div>
              <div>
                <label htmlFor="error-input" className={labelClass}>
                  Error state
                </label>
                <input
                  id="error-input"
                  type="text"
                  defaultValue="not-an-email"
                  aria-invalid="true"
                  className={`${fieldClass} border-red-300 focus:border-red-400`}
                />
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5" /> That doesn&apos;t look like a valid email.
                </p>
              </div>
              <div>
                <label htmlFor="disabled-input" className={labelClass}>
                  Disabled
                </label>
                <input
                  id="disabled-input"
                  type="text"
                  disabled
                  className={`${fieldClass} cursor-not-allowed bg-canvas text-muted`}
                  placeholder="Reserved for the org owner"
                />
              </div>
              <div>
                <label htmlFor="textarea" className={labelClass}>
                  Textarea
                </label>
                <textarea
                  id="textarea"
                  rows={3}
                  className="w-full rounded-lg border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy-800"
                  placeholder="Tell the agent what good looks like…"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-6">
            <h2 className="text-sm font-semibold text-ink">Selection</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="default-select" className={labelClass}>
                  Default select
                </label>
                <select id="default-select" className={fieldClass}>
                  <option>Choose a department</option>
                  <option>Marketing</option>
                  <option>Engineering</option>
                  <option>Operations</option>
                </select>
              </div>
              <div>
                <label htmlFor="disabled-select" className={labelClass}>
                  Disabled select
                </label>
                <select id="disabled-select" disabled className={`${fieldClass} cursor-not-allowed bg-canvas text-muted`}>
                  <option>Ownership locked</option>
                </select>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-hairline bg-white p-6">
            <h2 className="text-sm font-semibold text-ink">Checkboxes &amp; radios</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <div className="space-y-3">
                <CheckboxRow label="Post on socials" hint="Writer may publish to your channels" />
                <CheckboxRow label="Email the waitlist" hint="Writer may send campaigns" />
                <CheckboxRow label="Spend on ads" hint="Requires your approval first" disabled />
              </div>
              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-ink">Approval level</legend>
                <div className="space-y-2.5">
                  {[
                    { v: "auto", label: "Auto-approve within budget" },
                    { v: "ask", label: "Ask me every time" },
                    { v: "delegate", label: "Delegate to an executive" },
                  ].map((o) => (
                    <label key={o.v} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
                      <input
                        type="radio"
                        name="approval"
                        checked={approval === o.v}
                        onChange={() => setApproval(o.v)}
                        className="h-4 w-4 border-hairline accent-emerald"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
          </section>
        </div>

        {/* Composed form: hire an agent */}
        <section className="h-fit rounded-xl border border-hairline bg-white p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-navy-900 text-emerald">
              <UserPlus className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-ink">Hire an agent</h2>
              <p className="text-xs text-muted">Phase 2 template · every hire follows your budget policies</p>
            </div>
          </div>

          {hired ? (
            <div role="status" className="mt-6 rounded-xl border border-emerald/30 bg-emerald/10 p-6 text-center">
              <CheckCircle2 className="mx-auto h-8 w-8 text-emerald" aria-hidden />
              <p className="mt-3 text-sm font-semibold text-ink">
                {hired} is hired and onboarding
              </p>
              <p className="mt-1 text-xs text-muted">
                Assigned to its department with the approval level and budget you set.
              </p>
              <button
                type="button"
                onClick={() => setHired(null)}
                className="mt-4 rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-navy-800"
              >
                Hire another
              </button>
            </div>
          ) : (
            <form onSubmit={hire} className="mt-6 space-y-4">
              <div>
                <label htmlFor="role" className={labelClass}>
                  Role template
                </label>
                <select id="role" name="role" className={fieldClass} defaultValue="Market researcher">
                  {roleTemplates.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name} · {r.dept} · {r.cost}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="agent_name" className={labelClass}>
                  Agent name
                </label>
                <input
                  id="agent_name"
                  name="agent_name"
                  type="text"
                  required
                  className={fieldClass}
                  placeholder="Writer · β"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="dept" className={labelClass}>
                    Department
                  </label>
                  <select id="dept" name="dept" className={fieldClass}>
                    <option>Marketing</option>
                    <option>Engineering</option>
                    <option>Operations</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="budget" className={labelClass}>
                    Weekly budget
                  </label>
                  <input id="budget" name="budget" type="number" min={0} defaultValue={20} className={fieldClass} />
                </div>
              </div>

              <fieldset>
                <legend className="mb-1.5 text-sm font-medium text-ink">Approval level</legend>
                <div className="space-y-2">
                  {[
                    { v: "auto", label: "Auto-approve within budget" },
                    { v: "ask", label: "Ask me every time" },
                  ].map((o) => (
                    <label key={o.v} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
                      <input
                        type="radio"
                        name="hire_approval"
                        checked={approval === o.v}
                        onChange={() => setApproval(o.v)}
                        className="h-4 w-4 border-hairline accent-emerald"
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <CheckboxRow label="Can spend within budget" hint="Actions under the weekly cap run automatically" />

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-hairline px-4 py-3">
                <span>
                  <span className="block text-sm font-medium text-ink">Weekly report</span>
                  <span className="block text-xs text-muted">Summarize this agent&apos;s work every Monday</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reportWeekly}
                  onClick={() => setReportWeekly((v) => !v)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    reportWeekly ? "bg-emerald" : "bg-hairline"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      reportWeekly ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>

              <button
                type="submit"
                disabled={hiring}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-navy-900 text-sm font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {hiring ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Hiring…
                  </>
                ) : (
                  "Hire agent"
                )}
              </button>
            </form>
          )}
        </section>
      </div>
    </div>
  );
}
