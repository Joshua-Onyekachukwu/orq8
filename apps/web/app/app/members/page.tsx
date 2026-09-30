"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  AlertCircle,
  RefreshCw,
  UserPlus,
  Copy,
  Check,
  Trash2,
  Link2,
  Loader2,
} from "lucide-react";

/**
 * Members & Roles — the people in the company, and the controls that change
 * them.
 *
 * Operationally this page has to answer three questions, and every rule behind
 * them is enforced in the API (services/members.ts), never here:
 *
 *   who is in the company, and with what role
 *   who has been invited, and what that invitation's link is
 *   what happens when I change a role or remove someone
 *
 * The invite link is the interesting one. Only a sha256 of each token is stored,
 * so an invitation's link can be shown when it is created and never again — for
 * a pending invitation the honest control is "New link", which mints a fresh
 * token (killing the old one) and re-sends the email. The page says that plainly
 * instead of pretending an old link is recoverable.
 */

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  type: "human" | "agent";
  status: string;
  department: string | null;
  tasksCompleted: number;
  weeklyCost: number;
  memberSince: string;
  createdAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

interface IssuedLink {
  email: string;
  role: string;
  acceptUrl: string;
  delivery: string;
}

const roleStyles: Record<string, string> = {
  owner: "bg-ink-accent/20 text-ink",
  admin: "bg-brand-soft text-brand-deep",
  member: "bg-canvas text-muted",
  agent: "bg-ink-accent/10 text-brand-ink",
};

const ASSIGNABLE_ROLES = ["owner", "admin", "member", "viewer"] as const;
const rowsPerPage = 10;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

/** Delivery verdict from the API, said in words the inviter can act on. */
function deliveryLine(delivery: string, email: string): string {
  if (delivery === "sent") return `Invitation emailed to ${email}.`;
  if (delivery === "unconfigured") {
    return `No mail provider is configured here, so nothing was sent — send ${email} this link yourself.`;
  }
  if (delivery === "failed") return `The email could not be sent — send ${email} this link yourself.`;
  return `Invitation created for ${email}.`;
}

/** The API answers member refusals with a plain message, and the rest of the app with an envelope. */
function apiMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object") {
    const direct = (json as { message?: unknown }).message;
    if (typeof direct === "string" && direct.length > 0) return direct;
    const nested = (json as { error?: { message?: unknown } }).error?.message;
    if (typeof nested === "string" && nested.length > 0) return nested;
  }
  return fallback;
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [viewer, setViewer] = useState<{ id: string; email: string; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, invitesRes, meRes] = await Promise.all([
        fetch("/api/members"),
        fetch("/api/members/invitations", { cache: "no-store" }),
        fetch("/api/auth/me", { cache: "no-store" }),
      ]);

      if (!membersRes.ok) throw new Error("Failed to fetch members");
      const membersJson = await membersRes.json();
      setMembers(membersJson.data ?? []);
      setTotalCount(membersJson.meta?.total ?? 0);

      if (invitesRes.ok) {
        const invitesJson = await invitesRes.json();
        setInvitations(invitesJson.data ?? []);
      }

      if (meRes.ok) {
        const meJson = await meRes.json();
        const activeOrgId = meJson?.data?.active_org_id;
        const membership = (meJson?.data?.memberships ?? []).find(
          (m: { org?: { id?: string } }) => m?.org?.id === activeOrgId,
        );
        setViewer({
          id: meJson?.data?.user?.id ?? "",
          email: meJson?.data?.user?.email ?? "",
          role: membership?.role ?? "member",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canManage = viewer?.role === "owner" || viewer?.role === "admin";
  // Only an owner may grant owner; the API enforces it either way, and offering
  // a control that always fails would be its own kind of lie.
  const assignableRoles = useMemo(
    () => ASSIGNABLE_ROLES.filter((r) => r !== "owner" || viewer?.role === "owner"),
    [viewer?.role],
  );

  const copyLink = useCallback(async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    } catch {
      // Clipboard access is unavailable over plain http or without permission.
      // The link stays selectable in its read-only field.
      setNotice("Copying needs clipboard permission — select the link and copy it manually.");
    }
  }, []);

  const sendInvite = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setInviteError(null);
      setIssued(null);
      setBusy("invite");
      try {
        const res = await fetch("/api/members/invitations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setInviteError(apiMessage(json, "The invitation could not be created."));
          return;
        }
        setIssued({
          email: json?.data?.email ?? inviteEmail.trim(),
          role: json?.data?.role ?? inviteRole,
          acceptUrl: json?.data?.acceptUrl ?? "",
          delivery: json?.data?.delivery ?? "unknown",
        });
        setInviteEmail("");
        await load();
      } catch {
        setInviteError("Could not reach the server. Try again in a moment.");
      } finally {
        setBusy(null);
      }
    },
    [inviteEmail, inviteRole, load],
  );

  const renewInvitation = useCallback(
    async (id: string) => {
      setBusy(`renew:${id}`);
      setError(null);
      setIssued(null);
      try {
        const res = await fetch(`/api/members/invitations/${id}/renew`, { method: "POST" });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(apiMessage(json, "A new link could not be issued."));
          return;
        }
        setIssued({
          email: json?.data?.email ?? "",
          role: json?.data?.role ?? "",
          acceptUrl: json?.data?.acceptUrl ?? "",
          delivery: json?.data?.delivery ?? "unknown",
        });
        await load();
      } catch {
        setError("Could not reach the server. Try again in a moment.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const revokeInvitation = useCallback(
    async (id: string) => {
      setBusy(`revoke:${id}`);
      setError(null);
      try {
        const res = await fetch(`/api/members/invitations/${id}/revoke`, { method: "POST" });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setError(apiMessage(json, "The invitation could not be revoked."));
          return;
        }
        setNotice("Invitation withdrawn. The link no longer works.");
        await load();
      } catch {
        setError("Could not reach the server. Try again in a moment.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const changeRole = useCallback(
    async (userId: string, role: string) => {
      setBusy(`role:${userId}`);
      setError(null);
      try {
        const res = await fetch(`/api/members/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setError(apiMessage(json, "The role could not be changed."));
          return;
        }
        setNotice("Role updated.");
        await load();
      } catch {
        setError("Could not reach the server. Try again in a moment.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const removeMember = useCallback(
    async (member: Member) => {
      if (!window.confirm(`Remove ${member.name} (${member.email}) from this company?`)) return;
      setBusy(`remove:${member.id}`);
      setError(null);
      try {
        const res = await fetch(`/api/members/${member.id}`, { method: "DELETE" });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setError(apiMessage(json, "The member could not be removed."));
          return;
        }
        setNotice(`${member.name} was removed. Their work and audit trail stay in the company.`);
        await load();
      } catch {
        setError("Could not reach the server. Try again in a moment.");
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const filtered = useMemo(
    () =>
      members.filter(
        (m) =>
          m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          m.email.toLowerCase().includes(searchTerm.toLowerCase()),
      ),
    [members, searchTerm],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  const displayed = filtered.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const humanCount = members.filter((m) => m.type === "human").length;
  const agentCount = members.filter((m) => m.type === "agent").length;
  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  return (
    <PageErrorBoundary pageName="Members & Roles" backHref="/app">
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-brand-ink">
            Organization · {humanCount} human{humanCount !== 1 ? "s" : ""} · {agentCount} agent{agentCount !== 1 ? "s" : ""}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Members &amp; Roles
          </h1>
          <p className="mt-1 text-sm text-muted">
            The humans and AI agents in your company, with the authority each one
            holds.
          </p>
        </div>
        <button
          type="button"
          aria-label="Refresh members" onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
      </header>

      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-border-error bg-error-soft px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-error-ink" />
          <p className="text-sm text-error-ink">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-xs text-error-ink hover:text-error-ink"
          >
            Dismiss
          </button>
        </div>
      )}

      {notice && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-hairline bg-brand-soft px-4 py-3">
          <Check className="h-4 w-4 shrink-0 text-brand-deep" />
          <p className="text-sm text-brand-deep">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="ml-auto text-xs text-brand-deep hover:text-brand-deep"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Invite a teammate ───────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border border-hairline bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-brand-ink" aria-hidden />
            <h2 className="text-sm font-semibold text-ink">Invite a teammate</h2>
          </div>
          <p className="text-xs text-muted">
            {viewer
              ? `You are ${viewer.role} in this company.`
              : null}
          </p>
        </div>

        {!canManage ? (
          <p className="px-5 py-4 text-sm text-muted">
            Only an owner or an admin can invite people or change roles. Ask an owner
            to invite you in, or to raise your role.
          </p>
        ) : (
          <form onSubmit={sendInvite} className="space-y-4 px-5 py-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1">
                <span className="font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Email address
                </span>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-deep"
                />
              </label>
              <label className="w-[160px]">
                <span className="font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted">
                  Role
                </span>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-hairline bg-canvas px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand-deep"
                >
                  {assignableRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                disabled={busy === "invite"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-deep px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand disabled:opacity-60"
              >
                {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserPlus className="h-4 w-4" aria-hidden />}
                Send invitation
              </button>
            </div>

            <p className="text-xs text-muted">
              The invitation is tied to that address — a forwarded link cannot seat
              anyone else. Only an owner can grant the owner role, and nobody can
              change their own membership.
            </p>

            {inviteError && (
              <div className="flex items-start gap-2 rounded-lg border border-border-error bg-error-soft px-3 py-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error-ink" aria-hidden />
                <p className="text-sm text-error-ink">{inviteError}</p>
              </div>
            )}

            {issued && (
              <div className="rounded-lg border border-hairline bg-canvas p-3">
                <p className="text-sm text-ink">
                  {deliveryLine(issued.delivery, issued.email)}
                </p>
                {issued.acceptUrl && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      readOnly
                      aria-label="Accept link"
                      value={issued.acceptUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 rounded-md border border-hairline bg-white px-2.5 py-2 font-mono text-xs text-ink"
                    />
                    <button
                      type="button"
                      onClick={() => copyLink(issued.acceptUrl)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas"
                    >
                      {copied ? <Check className="h-3.5 w-3.5 text-brand-deep" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                      {copied ? "Copied" : "Copy link"}
                    </button>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted">
                  Role: <span className="font-medium text-ink">{issued.role}</span> · single
                  use · expires 14 days after it was issued.
                </p>
              </div>
            )}
          </form>
        )}
      </section>

      {/* ── Pending invitations ─────────────────────────────────────────── */}
      {invitations.length > 0 && (
        <section className="mt-6 rounded-xl border border-hairline bg-white">
          <div className="flex items-center gap-2 border-b border-hairline px-5 py-4">
            <Link2 className="h-4 w-4 text-brand-ink" aria-hidden />
            <h2 className="text-sm font-semibold text-ink">
              Invitations
              {pendingInvitations.length > 0 ? ` · ${pendingInvitations.length} open` : ""}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas text-left">
                  {["Email", "Role", "Status", "Sent", "Expires", ""].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-5 py-3 font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {invitations.map((invite) => (
                  <tr key={invite.id} className="transition-colors hover:bg-canvas/60">
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-ink">{invite.email}</td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-wide ${
                          roleStyles[invite.role] ?? "bg-canvas text-muted"
                        }`}
                      >
                        {invite.role}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <span
                        className={`rounded-full px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-wide ${
                          invite.status === "pending" ? "bg-brand-soft text-brand-deep" : "bg-canvas text-muted"
                        }`}
                      >
                        {invite.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                      {formatDate(invite.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                      {formatDate(invite.expiresAt)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      {invite.status === "pending" && canManage && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => renewInvitation(invite.id)}
                            disabled={busy === `renew:${invite.id}`}
                            className="rounded-md border border-hairline px-2.5 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-60"
                          >
                            {busy === `renew:${invite.id}` ? "Working…" : "New link"}
                          </button>
                          <button
                            type="button"
                            onClick={() => revokeInvitation(invite.id)}
                            disabled={busy === `revoke:${invite.id}`}
                            className="rounded-md border border-hairline px-2.5 py-1.5 text-xs font-medium text-error-ink transition-colors hover:bg-error-soft disabled:opacity-60"
                          >
                            {busy === `revoke:${invite.id}` ? "Working…" : "Revoke"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="border-t border-hairline px-5 py-3 text-xs text-muted">
            Links are stored hashed, so an existing link cannot be shown again — “New
            link” issues a fresh one and stops the previous one working.
          </p>
        </section>
      )}

      {/* ── Members ─────────────────────────────────────────────────────── */}
      {loading && members.length === 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white">
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b border-hairline px-5 py-4 animate-pulse">
                <div className="h-10 w-10 rounded-full bg-hairline" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/4 rounded bg-hairline" />
                  <div className="h-3 w-1/3 rounded bg-hairline" />
                </div>
                <div className="h-6 w-16 rounded-full bg-hairline" />
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && members.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No members yet</p>
          <p className="mt-1 text-sm text-muted">
            Members will appear here once you invite humans or hire AI agents.
          </p>
        </div>
      )}

      {!loading && members.length > 0 && (
        <div className="mt-6 rounded-xl border border-hairline bg-white">
          <div className="border-b border-hairline px-5 py-4">
            <label className="relative block max-w-xs">
              <span className="sr-only">Search members</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search members..."
                className="w-full rounded-lg border border-hairline bg-canvas py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-deep"
              />
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-canvas text-left">
                  {["Member", "Email", "Type", "Role", "Department", "Status", "Joined", canManage ? "" : "Role source"].map(
                    (h) => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-5 py-3 font-mono text-3xs font-semibold uppercase tracking-[0.14em] text-muted"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {displayed.map((m) => {
                  const isSelf = viewer?.id === m.id;
                  const human = m.type === "human";
                  return (
                    <tr key={m.id} className="transition-colors hover:bg-canvas/60">
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full ink text-sm font-bold text-brand-ink">
                            {m.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="text-sm font-medium text-ink">{m.name}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                        {m.email}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-wide ${
                            m.type === "agent"
                              ? "bg-ink-accent/10 text-brand-ink"
                              : "bg-brand-soft text-brand-deep"
                          }`}
                        >
                          {m.type}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {human && canManage && !isSelf ? (
                          <select
                            value={m.role}
                            aria-label={`Role for ${m.name}`}
                            onChange={(e) => changeRole(m.id, e.target.value)}
                            disabled={busy === `role:${m.id}`}
                            className="rounded-md border border-hairline bg-white px-2 py-1.5 text-xs font-medium text-ink outline-none transition-colors focus:border-brand-deep disabled:opacity-60"
                          >
                            {/* An existing owner is listed even for an admin, who simply cannot change it. */}
                            {(ASSIGNABLE_ROLES.includes(m.role as (typeof ASSIGNABLE_ROLES)[number])
                              ? Array.from(new Set([...assignableRoles, m.role]))
                              : assignableRoles
                            ).map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`rounded-full px-2.5 py-1 font-mono text-3xs font-semibold uppercase tracking-wide ${
                              roleStyles[m.role] ?? "bg-canvas text-muted"
                            }`}
                          >
                            {m.role}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                        {m.department ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-3xs font-semibold uppercase ${
                            m.status === "active"
                              ? "bg-ink-accent/10 text-brand-ink"
                              : "bg-hairline text-muted"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              m.status === "active" ? "bg-brand-deep" : "bg-hairline"
                            }`}
                          />
                          {m.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-sm text-muted">
                        {formatDate(m.memberSince)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        {human && canManage && !isSelf ? (
                          <button
                            type="button"
                            onClick={() => removeMember(m)}
                            disabled={busy === `remove:${m.id}`}
                            className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-xs font-medium text-error-ink transition-colors hover:bg-error-soft disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            {busy === `remove:${m.id}` ? "Removing…" : "Remove"}
                          </button>
                        ) : (
                          <span className="text-xs text-muted">
                            {isSelf ? "You" : human ? "Managed by an owner" : "AI employee"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3.5">
            <p className="text-sm text-muted">
              Showing {displayed.length} of {filtered.length} results
              {totalCount > filtered.length ? ` (${totalCount} total)` : ""}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                aria-label="Previous page"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="flex h-8 w-8 items-center justify-center rounded-md ink text-xs font-semibold text-white">
                {safePage}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                aria-label="Next page"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-ink transition-colors hover:border-brand-deep disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageErrorBoundary>
  );
}
