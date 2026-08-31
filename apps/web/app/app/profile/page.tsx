"use client";

import { useState, useEffect, useCallback } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  CheckCircle2,
  Edit,
  Mail,
  MapPin,
  AlertCircle,
  RefreshCw,
  Users,
  Activity,
  CreditCard,
  Save,
  Loader2,
  X,
} from "lucide-react";

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

interface Agent {
  id: string;
  name: string;
  role: string;
  department: string | null;
  status: string;
  tasksCompleted: number;
}

interface MeData {
  user: UserData;
  memberships: Membership[];
  active_org_id: string | null;
}

interface CreditBalance {
  balance: { total: number; used: number; remaining: number };
}

export default function ProfilePage() {
  const [me, setMe] = useState<MeData | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [meRes, agentsRes, creditsRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/agents"),
        fetch("/api/credits/balance"),
      ]);

      if (meRes.ok) {
        const json = await meRes.json();
        setMe(json.data ?? null);
      }
      if (agentsRes.ok) {
        const json = await agentsRes.json();
        setAgents(json.data ?? []);
      }
      if (creditsRes.ok) {
        const json = await creditsRes.json();
        setCredits(json.data ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const user = me?.user;
  const activeOrg = me?.memberships?.find((m) => m.org.id === me.active_org_id) ?? me?.memberships?.[0];
  const org = activeOrg?.org;
  const activeAgents = agents.filter((a) => a.status === "active");
  const totalTasks = agents.reduce((sum, a) => sum + a.tasksCompleted, 0);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="animate-pulse space-y-6">
          <div className="h-40 rounded-xl bg-hairline" />
          <div className="h-64 rounded-xl bg-hairline" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <PageErrorBoundary pageName="Profile" backHref="/app">
    <div className="mx-auto max-w-5xl">
      {/* Cover card */}
      <div className="overflow-hidden rounded-xl border border-hairline bg-white">
        <div className="relative h-36 bg-navy-950 sm:h-44">
          <div aria-hidden className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
          <div aria-hidden className="absolute -top-20 right-10 h-56 w-56 rounded-full bg-emerald/20 blur-[80px]" />
          <div aria-hidden className="absolute bottom-4 left-6 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
            {org?.name ?? "My Organization"} · Profile
          </div>
        </div>

        <div className="px-6 pb-6 pt-0 sm:px-8">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
            <div className="flex items-end gap-4">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-white bg-navy-900 text-2xl font-bold text-emerald shadow-lg sm:h-24 sm:w-24 sm:text-3xl">
                {(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}
              </span>
              <div className="pb-1">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Your name"
                      className="rounded-lg border border-hairline bg-white px-3 py-1.5 text-lg font-bold text-ink outline-none focus:border-navy-800"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const res = await fetch("/api/auth/me", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ name: editName.trim() }),
                          });
                          if (res.ok) {
                            const json = await res.json();
                            setMe((prev) => prev ? { ...prev, user: { ...prev.user, name: json.data.name } } : prev);
                            setEditing(false);
                            setSaveSuccess(true);
                            setTimeout(() => setSaveSuccess(false), 2000);
                          }
                        } finally {
                          setSaving(false);
                        }
                      }}
                      disabled={saving || !editName.trim()}
                      className="rounded-lg bg-navy-900 p-1.5 text-white hover:bg-navy-800 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(false)}
                      className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="flex items-center gap-2 text-lg font-bold tracking-tight text-ink sm:text-xl">
                      {user?.name ?? "Founder"}
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-lime text-navy-950" title="Verified">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      </span>
                      <button
                        type="button"
                        onClick={() => { setEditing(true); setEditName(user?.name ?? ""); }}
                        className="rounded p-1 text-muted transition-colors hover:bg-canvas hover:text-ink"
                        title="Edit name"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                    </p>
                    {saveSuccess && (
                      <p className="mt-1 text-xs text-emerald-600">Profile updated successfully</p>
                    )}
                  </>
                )}
                <p className="text-sm text-muted">
                  {activeOrg?.role === "owner" ? "Founder & CEO" : activeOrg?.role ?? "Member"} · {org?.name ?? "ORQ8"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-navy-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald/10 text-emerald-700">
            <Users className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            AI Workforce
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {agents.length}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {activeAgents.length} active
          </p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
            <Activity className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Tasks Completed
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {totalTasks}
          </p>
          <p className="mt-0.5 text-xs text-muted">across all agents</p>
        </div>

        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
            <CreditCard className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
            Credits Remaining
          </p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-ink tabular-nums">
            {credits?.balance?.remaining?.toLocaleString() ?? "—"}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {org?.plan ?? "trial"} plan
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-4 rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-emerald">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Email</p>
            <p className="truncate text-sm font-medium text-ink">{user?.email ?? "—"}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-emerald">
            <CheckCircle2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Organization</p>
            <p className="truncate text-sm font-medium text-ink">{org?.name ?? "—"}</p>
          </div>
        </div>
      </div>

      {/* Agent roster */}
      {agents.length > 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">My AI Workforce</h2>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
              {activeAgents.length} working
            </span>
          </div>
          <ul className="mt-4 divide-y divide-hairline">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-900 text-sm font-bold text-emerald">
                  {a.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                  <p className="truncate text-xs text-muted">{a.role}{a.department ? ` · ${a.department}` : ""}</p>
                </div>
                <div className="text-right">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${a.status === "active" ? "bg-emerald/15 text-emerald-700" : "bg-canvas text-muted"}`}>
                    {a.status}
                  </span>
                  <p className="mt-1 font-mono text-[10px] text-muted">{a.tasksCompleted} tasks</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
    </PageErrorBoundary>
  );
}
