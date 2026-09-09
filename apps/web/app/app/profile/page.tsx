"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { downscaleImage } from "../../../lib/image-downscale";
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
  Upload,
  X,
  Shield,
  Clock,
  Building2,
  Key,
  LogOut,
  Calendar,
  Settings,
} from "lucide-react";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  jobTitle?: string | null;
  timezone?: string | null;
  avatarUrl?: string | null;
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

/**
 * AvatarControl — the profile avatar with upload/replace/remove.
 * Client-side pre-validation (type + size) gives instant feedback; the
 * server re-validates everything (MIME, magic bytes, size) authoritatively.
 */
function AvatarControl({
  avatarUrl,
  fallbackInitial,
  onUploaded,
  onRemoved,
}: {
  avatarUrl: string | null;
  fallbackInitial: string;
  onUploaded: (url: string) => void;
  onRemoved: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError("Use a PNG, JPEG or WebP image.");
      return;
    }
    setUploading(true);
    try {
      // Downscale in the browser (512px long edge) before upload. Runs for
      // every image: small ones pass through untouched (no re-encode),
      // while large photos — including >2 MB ones the API would reject —
      // are resized to a fraction of the cap. Any failure falls back to
      // the original file; downscaling must never break a workable upload.
      let uploadBlob: Blob = file;
      let uploadMime = file.type;
      try {
        const scaled = await downscaleImage(file);
        if (scaled.blob.size <= 2 * 1024 * 1024) {
          uploadBlob = scaled.blob;
          uploadMime = scaled.mimeType;
        }
      } catch {
        // keep the original file
      }
      if (uploadBlob.size > 2 * 1024 * 1024) {
        setError("That image is too large even after resizing. Try a smaller one.");
        return;
      }
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          resolve(result.slice(result.indexOf(",") + 1));
        };
        reader.onerror = () => reject(new Error("read failed"));
        reader.readAsDataURL(uploadBlob);
      });
      const res = await fetch("/api/avatars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: uploadMime, body: base64 }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data?.avatarUrl) {
        onUploaded(json.data.avatarUrl);
      } else {
        setError(json?.error?.message ?? "Upload failed. Try again.");
      }
    } catch {
      setError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemove() {
    setError(null);
    setUploading(true);
    try {
      const res = await fetch("/api/avatars", { method: "DELETE" });
      if (res.ok) {
        onRemoved();
      } else {
        const json = await res.json().catch(() => null);
        setError(json?.error?.message ?? "Could not remove the avatar.");
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="group relative">
        <span className="-mt-10 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-orq8-dark text-2xl font-bold text-orq8-green shadow-lg sm:-mt-12 sm:h-24 sm:w-24 sm:text-3xl">
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
          ) : avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : (
            fallbackInitial
          )}
        </span>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label={avatarUrl ? "Change profile photo" : "Upload profile photo"}
          title={avatarUrl ? "Change photo" : "Upload photo"}
          className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-orq8-green text-white shadow transition-colors hover:bg-orq8-green-dark disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
      </div>
      {avatarUrl && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          className="text-3xs font-medium text-muted transition-colors hover:text-red-500"
        >
          Remove photo
        </button>
      )}
      {error && (
        <p className="max-w-40 text-center text-3xs text-red-500" role="alert">{error}</p>
      )}
    </div>
  );
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
      {/* Cover card — welcome banner.
          Layout contract: the dark cover is PURELY DECORATIVE (no absolute
          text at its bottom edge). The identity row below lives in normal
          document flow; only the avatar intentionally overlaps the cover
          boundary (half-on/half-off), which cannot obscure any content.
          Never place text back at the cover's bottom corners — that is what
          previously collided with the avatar and action buttons. */}
      <div className="overflow-hidden rounded-xl border border-hairline bg-white">
        <div className="relative h-20 bg-orq8-dark sm:h-24" aria-hidden="true">
          <div className="absolute inset-0 bg-grid-white [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)]" />
          <div className="absolute -top-20 right-10 h-56 w-56 rounded-full bg-orq8-green/20 blur-[80px]" />
        </div>

        <div className="px-6 pb-6 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
            {/* Identity — avatar overlaps the cover by exactly half its height */}
            <div className="flex min-w-0 items-end gap-4">
              <AvatarControl
                avatarUrl={user?.avatarUrl ?? null}
                fallbackInitial={(user?.name ?? user?.email ?? "U").charAt(0).toUpperCase()}
                onUploaded={(newUrl) => setMe((prev) => prev ? { ...prev, user: { ...prev.user, avatarUrl: newUrl } } : prev)}
                onRemoved={() => setMe((prev) => prev ? { ...prev, user: { ...prev.user, avatarUrl: null } } : prev)}
              />
              <div className="min-w-0 pb-1">
                {editing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Your name"
                      className="w-48 max-w-full rounded-lg border border-hairline bg-white px-3 py-1.5 text-lg font-bold text-ink outline-none focus:border-orq8-green"
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
                      className="rounded-lg bg-orq8-green p-1.5 text-white transition-colors hover:bg-orq8-green-dark disabled:opacity-50"
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
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 break-words text-lg font-bold tracking-tight text-ink sm:text-xl">
                      <span className="break-words">{user?.name ?? "Founder"}</span>
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orq8-lime text-white" title="Verified" aria-label="Verified">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <button
                        type="button"
                        onClick={() => { setEditing(true); setEditName(user?.name ?? ""); }}
                        className="rounded p-1 text-muted transition-colors hover:bg-canvas hover:text-ink"
                        title="Edit name"
                        aria-label="Edit name"
                      >
                        <Edit className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </p>
                    {saveSuccess && (
                      <p className="mt-1 text-xs text-orq8-green" role="status">Profile updated successfully</p>
                    )}
                  </>
                )}
                <p className="mt-0.5 break-words text-sm text-muted">
                  {(() => {
                    const hour = new Date().getHours();
                    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
                    return `${greeting}, ${(user?.name ?? "Founder").split(" ")[0]}.`;
                  })()}
                  {" "}
                  {activeAgents.length > 0
                    ? `${activeAgents.length} AI employee${activeAgents.length !== 1 ? "s" : ""} working in ${org?.name ?? "your organization"}.`
                    : "Hire your first AI employee to get started."}
                </p>
                <p className="mt-0.5 break-words text-sm font-medium text-ink/80">
                  {user?.jobTitle ?? (activeOrg?.role === "owner" ? "Founder & CEO" : activeOrg?.role ?? "Member")}
                  <span className="text-muted"> · {org?.name ?? "Organization"}</span>
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a
                href="/settings"
                className="inline-flex items-center gap-1.5 rounded-full bg-orq8-green px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orq8-green-dark"
              >
                <Edit className="h-3.5 w-3.5" aria-hidden="true" /> Edit profile
              </a>
              <button
                type="button"
                onClick={fetchData}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-orq8-green"
              >
                <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-hairline bg-white p-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orq8-lime/10 text-orq8-green">
            <Users className="h-4 w-4" />
          </span>
          <p className="mt-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
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
          <p className="mt-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
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
          <p className="mt-3 font-mono text-3xs font-semibold uppercase tracking-[0.18em] text-muted">
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

      {/* Account Details Grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {/* Contact Information */}
        <div className="rounded-xl border border-hairline bg-white p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Mail className="h-4 w-4 text-muted" />
            Contact Information
          </h3>
          <div className="mt-4 space-y-4">
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.16em] text-muted">Email</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{user?.email ?? "—"}</p>
            </div>
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.16em] text-muted">Display Name</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{user?.name ?? "Not set"}</p>
            </div>
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.16em] text-muted">Job Title</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{user?.jobTitle ?? "Not set"}</p>
            </div>
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.16em] text-muted">Timezone</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{user?.timezone ?? "Not set"}</p>
            </div>
          </div>
          <a
            href="/settings"
            className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-hairline px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-orq8-green hover:text-orq8-green"
          >
            <Edit className="h-3.5 w-3.5" /> Edit in Settings
          </a>
        </div>

        {/* Organization */}
        <div className="rounded-xl border border-hairline bg-white p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Building2 className="h-4 w-4 text-muted" />
            Organization
          </h3>
          <div className="mt-4 space-y-4">
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.16em] text-muted">Company</p>
              <p className="mt-0.5 text-sm font-medium text-ink">{org?.name ?? "—"}</p>
            </div>
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.16em] text-muted">Role</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-orq8-lime/10 px-2.5 py-1 text-xs font-medium text-orq8-green">
                  <Shield className="h-3 w-3" />
                  {activeOrg?.role === "owner" ? "Founder" : activeOrg?.role ?? "Member"}
                </span>
              </div>
            </div>
            <div>
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.16em] text-muted">Plan</p>
              <p className="mt-0.5 text-sm font-medium text-ink capitalize">{org?.plan ?? "trial"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Account Security */}
      <div className="mt-6 rounded-xl border border-hairline bg-white p-6">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Key className="h-4 w-4 text-muted" />
          Account Security
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg bg-canvas px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orq8-lime/10">
              <CheckCircle2 className="h-4 w-4 text-orq8-green" />
            </div>
            <div>
              <p className="text-xs font-medium text-ink">Session Active</p>
              <p className="text-2xs text-muted">Authenticated</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-canvas px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orq8-lime/10">
              <Shield className="h-4 w-4 text-orq8-green" />
            </div>
            <div>
              <p className="text-xs font-medium text-ink">Password Set</p>
              <p className="text-2xs text-muted">Argon2id hashed</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-canvas px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orq8-lime/10">
              <Clock className="h-4 w-4 text-orq8-green" />
            </div>
            <div>
              <p className="text-xs font-medium text-ink">Session Timeout</p>
              <p className="text-2xs text-muted">30 days</p>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <a
            href="/settings/change-password"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-orq8-green hover:text-orq8-green"
          >
            <Key className="h-3.5 w-3.5" /> Change Password
          </a>
          <a
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-orq8-green hover:text-orq8-green"
          >
            <Settings className="h-3.5 w-3.5" /> Account Settings
          </a>
        </div>
      </div>

      {/* Agent roster */}
      {agents.length > 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">My AI Workforce</h2>
            <span className="font-mono text-3xs font-semibold uppercase tracking-[0.16em] text-orq8-green">
              {activeAgents.length} working
            </span>
          </div>
          <ul className="mt-4 divide-y divide-hairline">
            {agents.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orq8-dark text-sm font-bold text-orq8-green">
                  {a.name.charAt(0)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{a.name}</p>
                  <p className="truncate text-xs text-muted">{a.role}{a.department ? ` · ${a.department}` : ""}</p>
                </div>
                <div className="text-right">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase tracking-wide ${a.status === "active" ? "bg-orq8-lime/10 text-orq8-green" : "bg-canvas text-muted"}`}>
                    {a.status}
                  </span>
                  <p className="mt-1 font-mono text-3xs text-muted">{a.tasksCompleted} tasks</p>
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
