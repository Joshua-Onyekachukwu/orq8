"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { useAttention } from "../hooks/use-attention";

/**
 * Top-bar attention badge.
 *
 * The count is the real queue size from GET /v1/attention and refreshes on the
 * realtime `attention.changed` event. The link is always present so the queue
 * is reachable even when it is empty; the badge only appears when something is
 * actually waiting.
 */
export function AttentionBadge() {
  const { data } = useAttention();
  const total = data?.summary.total ?? 0;
  const critical = data?.summary.critical ?? 0;

  const title =
    total === 0
      ? "Attention: nothing waiting on you"
      : critical > 0
        ? `Attention: ${total} waiting, ${critical} critical`
        : `Attention: ${total} waiting on you`;

  return (
    <Link
      href="/app/attention"
      title={title}
      aria-label={title}
      className="relative rounded-lg p-2 text-ink-muted transition-colors hover:bg-surface-secondary hover:text-ink"
    >
      <Inbox className="h-5 w-5 text-ink-muted" />
      {total > 0 && (
        <span
          /* The warm fill is pale, so its label is ink: white on #F1C095 is
             1.65:1. The error fill is dark enough to carry white. */
          className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-2xs font-bold ${
            critical > 0 ? "bg-error-fill text-white" : "bg-warm text-ink-surface"
          }`}
        >
          {total > 99 ? "99+" : total}
        </span>
      )}
    </Link>
  );
}
