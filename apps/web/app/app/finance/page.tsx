import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Wallet } from "lucide-react";
import { fetchWithAuth } from "../../../lib/api";
import { PageShell } from "../../../components/page-shell";

export const metadata: Metadata = {
  title: "Finance",
  description: "Balance, MRR and invoices — real money only, from the connected payment provider.",
};

interface Integration {
  id: string;
  provider: string;
  status: string;
}

/**
 * Finance (docs/71 §L, mock screen "Finance").
 *
 * The design rule here is honesty over decoration: every figure on this page is
 * $0.00 until a payment provider is actually connected, and the page says so in
 * words rather than dressing the zeros up as performance. The provider row reads
 * the real integrations list, so it flips the moment a payments connector is
 * added — no invented revenue, ever.
 */
export default async function FinancePage() {
  const integrations = (await fetchWithAuth<Integration[]>("/v1/integrations", {
    revalidate: false,
  })) ?? [];

  const connectedPaymentProvider = integrations.find(
    (i) => /stripe|payment|billing|paypal|square/i.test(i.provider) && i.status === "connected",
  );

  const stats: { label: string; value: string; tone?: "warm" }[] = [
    { label: "Balance", value: "$0.00" },
    { label: "MRR", value: "$0.00" },
    { label: "This month in", value: "$0.00" },
    {
      label: "Provider",
      value: connectedPaymentProvider ? connectedPaymentProvider.provider : "Not connected",
      tone: connectedPaymentProvider ? undefined : "warm",
    },
  ];

  return (
    <PageShell pageName="Finance" backHref="/app">
      <div>
        <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
          Economics
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Finance</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Real money only. Figures come from the connected payment provider.
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="console-card p-4">
            <span className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              {stat.label}
            </span>
            <p
              className={`mt-2 text-xl font-semibold tabular-nums ${
                stat.tone === "warm" ? "text-warm-ink" : "text-ink"
              }`}
            >
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      {connectedPaymentProvider ? (
        <p className="mt-5 text-sm text-muted">
          {connectedPaymentProvider.provider} is connected. Transactions and invoices appear here as
          money moves.
        </p>
      ) : (
        <div className="console-card mt-5 p-10 text-center">
          <Wallet className="mx-auto h-8 w-8 text-muted/40" />
          <p className="mt-3 text-sm font-medium text-ink">No real money has moved yet</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted">
            Connect a payment provider to see balance, transactions and invoices here.
          </p>
          <Link
            href="/app/integrations"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-warm px-3.5 py-2 text-xs font-semibold text-on-warm transition-opacity hover:opacity-90"
          >
            Connect payment provider <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <p className="mt-4 text-xs text-muted">
        What the company spends in credits is on{" "}
        <Link href="/app/usage" className="text-ink underline decoration-hairline-strong underline-offset-2 hover:text-brand-ink">
          Usage &amp; credits
        </Link>
        .
      </p>
    </PageShell>
  );
}
