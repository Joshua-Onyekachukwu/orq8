"use client";

import React from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  CircleSlash,
  Code2,
  Gauge,
  Handshake,
  Headphones,
  Layers,
  Megaphone,
  Package,
  Settings2,
  ShieldAlert,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  ATTENTION_KIND_LABEL,
  AUTHORITY_META,
  MODE_META,
  STATUS_META,
  type AttentionKind,
  type Authority,
  type Department,
  type Mode,
  type Status,
} from "../types";

/** One focus ring for the whole prototype. */
export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--orq-focus-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";

export function StatusChip({ status, size = "sm" }: { status: Status; size?: "sm" | "xs" }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md font-medium ${meta.chip} ${
        size === "xs" ? "px-1.5 py-0.5 text-3xs" : "px-2 py-0.5 text-2xs"
      }`}
    >
      <span aria-hidden>{meta.glyph}</span>
      {meta.label}
    </span>
  );
}

export function ModeChip({ mode }: { mode: Mode }) {
  const meta = MODE_META[mode];
  return <span className={`rounded-md px-2 py-0.5 text-2xs font-medium ${meta.chip}`}>{meta.label}</span>;
}

export function AuthorityChip({ authority }: { authority: Authority }) {
  const meta = AUTHORITY_META[authority];
  return <span className={`rounded-md px-2 py-0.5 text-2xs font-medium ${meta.chip}`}>{meta.label}</span>;
}

const KIND_ICON: Record<AttentionKind, LucideIcon> = {
  approval: BadgeCheck,
  budget: Wallet,
  decision: Gauge,
  permission: ShieldAlert,
  blocked: CircleSlash,
  failed: AlertTriangle,
  risk: Activity,
};

const KIND_TONE: Record<AttentionKind, string> = {
  approval: "bg-authority-approval-bg text-authority-approval-text",
  budget: "bg-authority-approval-bg text-authority-approval-text",
  decision: "bg-authority-approval-bg text-authority-approval-text",
  permission: "bg-authority-approval-bg text-authority-approval-text",
  blocked: "bg-status-blocked-bg text-status-blocked-text",
  failed: "bg-status-blocked-bg text-status-blocked-text",
  risk: "bg-error-soft text-error-ink",
};

export function KindChip({ kind }: { kind: AttentionKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-2xs font-medium ${KIND_TONE[kind]}`}>
      <Icon className="h-3 w-3" aria-hidden />
      {ATTENTION_KIND_LABEL[kind]}
    </span>
  );
}

const DEPT_ICON: Record<Department["icon"], LucideIcon> = {
  product: Package,
  engineering: Code2,
  marketing: Megaphone,
  sales: TrendingUp,
  success: Headphones,
  finance: Wallet,
  operations: Settings2,
  custom: Layers,
};

/** Departments are distinguished by structure and icon, never by colour. */
export function DepartmentIcon({ department, className = "h-4 w-4" }: { department: Department; className?: string }) {
  const Icon = DEPT_ICON[department.icon];
  return <Icon className={className} aria-hidden />;
}

export function Eyebrow({ children, as: As = "h2", className = "" }: { children: React.ReactNode; as?: "h2" | "h3" | "p"; className?: string }) {
  return (
    <As className={`eyebrow text-ink-faint ${className}`}>
      {children}
    </As>
  );
}

export function Initials({ name, className = "" }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <span
      className={`inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-3xs font-semibold text-brand-ink ${className}`}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/**
 * Progress as steps, never as a fake animated percentage. Three of five checks
 * reads as three filled segments and two hairline ones. Counts too long to draw
 * honestly (a list of 100 accounts) become one proportional bar instead of a
 * hundred ticks that would stretch the row.
 */
export function Steps({ done, total, unit }: { done: number; total: number; unit: string }) {
  const label = (
    <span className="text-2xs tabular-nums text-ink-muted">
      {done} of {total} {unit}
    </span>
  );
  if (total > 8) {
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-hairline-strong" aria-hidden>
          <span className="block h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
        </span>
        {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex shrink-0 items-center gap-[3px]" aria-hidden>
        {Array.from({ length: total }).map((_, index) => (
          <span
            key={index}
            className={`h-1 w-3 rounded-full ${index < done ? "bg-brand" : "bg-hairline-strong"}`}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

export function Credits({ value }: { value: number }) {
  return (
    <span className="tabular-nums">
      {value.toLocaleString()} {value === 1 ? "credit" : "credits"}
    </span>
  );
}

/** Small labelled number, used by the company state strip and the metrics band. */
export function Figure({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "attention" | "error";
  hint?: string;
}) {
  const valueTone =
    tone === "attention" ? "text-warm-ink" : tone === "error" ? "text-error-ink" : "text-ink";
  return (
    // Kept padding-free below desktop, where the grid gap separates the
    // figures, and inset once they sit in one divided row.
    <div className="min-w-0 py-1 xl:px-4 xl:py-3 xl:first:pl-0">
      <p className={`text-lg font-semibold tabular-nums ${valueTone}`}>{value}</p>
      <p className="mt-0.5 text-3xs font-medium uppercase tracking-[0.14em] text-ink-faint">{label}</p>
      {hint ? <p className="mt-0.5 text-2xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export const ICON_BUTTON = `inline-flex items-center gap-2 rounded-lg border border-hairline px-3 py-2 text-2sm font-medium text-ink transition-colors hover:bg-surface-secondary ${FOCUS}`;
export const PRIMARY_BUTTON = `inline-flex items-center justify-center gap-2 rounded-lg bg-brand-deep px-3.5 py-2 text-2sm font-semibold text-on-brand transition-colors hover:bg-brand-hover ${FOCUS}`;
export const GHOST_BUTTON = `inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-2sm font-medium text-text-brand transition-colors hover:bg-surface-secondary ${FOCUS}`;
export const DANGER_BUTTON = `inline-flex items-center justify-center gap-2 rounded-lg border border-border-error px-3.5 py-2 text-2sm font-semibold text-error-ink transition-colors hover:bg-error-soft ${FOCUS}`;

export function Button({
  variant = "icon",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "icon" | "primary" | "ghost" | "danger" }) {
  const styles = {
    icon: ICON_BUTTON,
    primary: PRIMARY_BUTTON,
    ghost: GHOST_BUTTON,
    danger: DANGER_BUTTON,
  }[variant];
  return <button type="button" {...props} className={`${styles} ${props.className ?? ""}`} />;
}
