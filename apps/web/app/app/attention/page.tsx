import type { Metadata } from "next";
import { fetchWithAuth } from "../../../lib/api";
import { AttentionBoard } from "../../../components/attention/attention-board";
import type { AttentionSnapshot } from "../../../lib/attention";

export const metadata: Metadata = {
  title: "Attention",
  description: "Approvals, blocked work, failures, credit alerts and escalations waiting on the founder.",
};

/**
 * Founder's Attention (docs/61 Phase 3).
 *
 * Server-rendered from GET /v1/attention with `revalidate: false`: a queue
 * whose value is being current must never be served from a cache. The client
 * board takes over for live refresh and actions.
 */
export default async function AttentionPage() {
  const snapshot = await fetchWithAuth<AttentionSnapshot>("/v1/attention", { revalidate: false });

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          Founder
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Attention
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Everything waiting on your decision, ordered by severity. Each item traces to a real
          record in your company, and every action calls the same endpoint the rest of the app
          uses.
        </p>
      </header>

      <AttentionBoard initial={snapshot} />
    </div>
  );
}
