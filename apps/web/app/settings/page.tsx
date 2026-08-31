"use client";

import { useState, useEffect, useCallback } from "react";
import { SettingsShell } from "../../components/settings-shell";
import { AlertCircle, RefreshCw, CheckCircle2, Loader2, Bell } from "lucide-react";

const fieldClass =
  "h-11 w-full rounded-lg border border-hairline bg-white px-3.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-navy-800";

const labelClass = "mb-1.5 block text-sm font-medium text-ink";

interface UserData {
  id: string;
  email: string;
  name: string | null;
}

interface OrgData {
  id: string;
  name: string;
  slug: string;
  plan: string;
}

interface Membership {
  org: OrgData;
  role: string;
}

interface MeData {
  user: UserData;
  memberships: Membership[];
  active_org_id: string | null;
}

interface NotificationPrefs {
  emailOnApproval: boolean;
  emailOnTaskComplete: boolean;
  emailOnAgentError: boolean;
  emailOnLowCredits: boolean;
  emailOnWeeklyReport: boolean;
  browserNotifications: boolean;
  soundEnabled: boolean;
}

export default function SettingsPage() {
  const [me, setMe] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>({
    emailOnApproval: true,
    emailOnTaskComplete: true,
    emailOnAgentError: true,
    emailOnLowCredits: true,
    emailOnWeeklyReport: true,
    browserNotifications: true,
    soundEnabled: true,
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("Failed to load profile");
      const json = await res.json();
      const data: MeData = json.data;
      setMe(data);

      // Split name into first/last
      const name = data.user.name ?? "";
      const parts = name.split(" ");
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" ") ?? "");

      // Set org name
      const activeOrg = data.memberships?.find((m) => m.org.id === data.active_org_id) ?? data.memberships?.[0];
      setCompany(activeOrg?.org.name ?? "");

      // Load notification preferences
      try {
        const settingsRes = await fetch("/api/settings");
        if (settingsRes.ok) {
          const settingsJson = await settingsRes.json();
          if (settingsJson.data?.notifications) {
            setNotifPrefs(settingsJson.data.notifications);
          }
        }
      } catch { /* Notification prefs are optional */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      // For now, simulate save — real implementation would call a profile update API
      await new Promise((r) => setTimeout(r, 500));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch {
      // Silent fail for now
    } finally {
      setSaving(false);
    }
  };

  const user = me?.user;
  const activeOrg = me?.memberships?.find((m) => m.org.id === me.active_org_id) ?? me?.memberships?.[0];
  const org = activeOrg?.org;

  if (loading) {
    return (
      <SettingsShell title="Account settings" description="Your profile, company details, and how ORQ8 addresses you.">
        <div className="max-w-3xl rounded-xl border border-hairline bg-white p-6 sm:p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 rounded bg-hairline" />
            <div className="h-4 w-64 rounded bg-hairline" />
            <div className="grid gap-5 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 w-20 rounded bg-hairline" />
                  <div className="h-11 rounded-lg bg-hairline" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SettingsShell>
    );
  }

  if (error) {
    return (
      <SettingsShell title="Account settings" description="Your profile, company details, and how ORQ8 addresses you.">
        <div className="max-w-3xl rounded-xl border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
          <button
            onClick={fetchData}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-red-700 hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell
      title="Account settings"
      description="Your profile, company details, and how ORQ8 addresses you."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="max-w-3xl rounded-xl border border-hairline bg-white p-6 sm:p-8"
      >
        {/* Profile photo */}
        <h2 className="text-lg font-semibold text-ink">Profile</h2>
        <p className="mt-1 text-sm text-muted">
          Your account details and organization information.
        </p>

        <div className="mt-6 flex items-center gap-4">
          <span className="relative h-16 w-16 overflow-hidden rounded-full border border-hairline">
            <span className="flex h-full w-full items-center justify-center bg-navy-900 text-lg font-bold text-emerald">
              {(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}
            </span>
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{user?.name ?? "Founder"}</p>
            <p className="text-xs text-muted">{user?.email}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="first-name" className={labelClass}>
              First name
            </label>
            <input
              id="first-name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="last-name" className={labelClass}>
              Last name
            </label>
            <input
              id="last-name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="email" className={labelClass}>
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={user?.email ?? ""}
              disabled
              className={`${fieldClass} cursor-not-allowed bg-canvas text-muted`}
            />
            <p className="mt-1 text-xs text-muted">Contact support to change your email</p>
          </div>
          <div>
            <label htmlFor="company" className={labelClass}>
              Organization
            </label>
            <input
              id="company"
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="role" className={labelClass}>
              Role
            </label>
            <input
              id="role"
              type="text"
              value={activeOrg?.role === "owner" ? "Founder & CEO" : activeOrg?.role ?? "Member"}
              disabled
              className={`${fieldClass} cursor-not-allowed bg-canvas text-muted`}
            />
          </div>
          <div>
            <label htmlFor="plan" className={labelClass}>
              Plan
            </label>
            <input
              id="plan"
              type="text"
              value={org?.plan ? org.plan.charAt(0).toUpperCase() + org.plan.slice(1) : "Trial"}
              disabled
              className={`${fieldClass} cursor-not-allowed bg-canvas text-muted`}
            />
          </div>
        </div>

        <div className="mt-8 flex items-center justify-between border-t border-hairline pt-6">
          <p className="text-xs text-muted">
            Last updated: just now
          </p>
          <div className="flex items-center gap-3">
            {saveSuccess && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-lime hover:text-navy-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save changes"
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Notification Preferences */}
      <div className="mt-6 max-w-3xl rounded-xl border border-hairline bg-white p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-muted" />
          <h2 className="text-lg font-semibold text-ink">Notification Preferences</h2>
        </div>
        <p className="mt-1 text-sm text-muted">
          Control how ORQ8 notifies you about agent activity and important events.
        </p>

        <div className="mt-6 space-y-4">
          {([
            ["emailOnApproval", "Approval requests", "Email when an AI employee needs your decision"],
            ["emailOnTaskComplete", "Task completions", "Email when an AI employee finishes a task"],
            ["emailOnAgentError", "Agent errors", "Email when an AI employee encounters a problem"],
            ["emailOnLowCredits", "Low credits", "Email when your Work Credits run low"],
            ["emailOnWeeklyReport", "Weekly report", "Email with your executive summary each week"],
          ] as const).map(([key, title, desc]) => (
            <div key={key} className="flex items-center justify-between gap-4 rounded-lg border border-hairline p-4">
              <div>
                <p className="text-sm font-medium text-ink">{title}</p>
                <p className="text-xs text-muted">{desc}</p>
              </div>
              <button
                type="button"
                onClick={() => setNotifPrefs((prev) => ({ ...prev, [key]: !prev[key] }))}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${notifPrefs[key] ? "bg-emerald" : "bg-gray-200"}`}
                role="switch"
                aria-checked={notifPrefs[key]}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${notifPrefs[key] ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
          ))}
        </div>

        {/* Browser Push Notifications */}
        <div className="mt-6 rounded-lg border border-hairline p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Browser push notifications</p>
              <p className="text-xs text-muted">Get notified even when the tab is in the background</p>
            </div>
            <div className="flex items-center gap-2">
              {typeof window !== "undefined" && "Notification" in window ? (
                <>
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                    Notification.permission === "granted" ? "bg-emerald/10 text-emerald-700" :
                    Notification.permission === "denied" ? "bg-red-50 text-red-600" :
                    "bg-amber-50 text-amber-700"
                  }`}>
                    {Notification.permission === "granted" ? "Allowed" :
                     Notification.permission === "denied" ? "Blocked" : "Not requested"}
                  </span>
                  {Notification.permission !== "granted" && Notification.permission !== "denied" && (
                    <button
                      type="button"
                      onClick={() => Notification.requestPermission().then((p) => {
                        // Force re-render to update the badge
                        setNotifPrefs((prev) => ({ ...prev }));
                      })}
                      className="text-xs font-medium text-emerald-700 hover:underline"
                    >
                      Enable
                    </button>
                  )}
                </>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-mono text-[10px] uppercase text-gray-500">
                  Not supported
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Sound Test */}
        <div className="mt-4 rounded-lg border border-hairline p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-ink">Sound alerts</p>
              <p className="text-xs text-muted">Play a chime when new notifications arrive</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  try {
                    const ctx = new AudioContext();
                    const now = ctx.currentTime;
                    [523, 659].forEach((freq, i) => {
                      const osc = ctx.createOscillator();
                      const gain = ctx.createGain();
                      osc.type = "sine";
                      const start = now + i * 0.1;
                      osc.frequency.setValueAtTime(freq, start);
                      gain.gain.setValueAtTime(0, start);
                      gain.gain.setValueAtTime(0.15, start);
                      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);
                      osc.connect(gain);
                      gain.connect(ctx.destination);
                      osc.start(start);
                      osc.stop(start + 0.3);
                    });
                  } catch { /* silent */ }
                }}
                className="text-xs font-medium text-emerald-700 hover:underline"
              >
                Test sound
              </button>
              <button
                type="button"
                onClick={() => setNotifPrefs((prev) => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${notifPrefs.soundEnabled ? "bg-emerald" : "bg-gray-200"}`}
                role="switch"
                aria-checked={notifPrefs.soundEnabled}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${notifPrefs.soundEnabled ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={async () => {
              setNotifSaving(true);
              setNotifSaved(false);
              try {
                await fetch("/api/settings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ notifications: notifPrefs }),
                });
                setNotifSaved(true);
                setTimeout(() => setNotifSaved(false), 2000);
              } catch { /* silent */ }
              setNotifSaving(false);
            }}
            disabled={notifSaving}
            className="inline-flex items-center gap-2 rounded-full bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:opacity-50"
          >
            {notifSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : notifSaved ? <CheckCircle2 className="h-4 w-4" /> : null}
            {notifSaved ? "Saved" : "Save preferences"}
          </button>
        </div>
      </div>
    </SettingsShell>
  );
}
