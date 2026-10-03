"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Loader2,
  RefreshCw,
  Wallet,
  XCircle,
} from "lucide-react";

/**
 * Buy Credits (docs/80 §3.6, H5).
 *
 * Three things the founder needs, in order: what a pack costs and what it
 * earns, a way to buy it, and the record of what they already bought. The price
 * and the credit quantity come from the **server's** catalog — the client names
 * a pack and nothing else, so a tampered request cannot buy 10,000 credits for
 * a dollar. Credits are granted by the verified Stripe webhook, never by this
 * page, so the success state says "payment received" and shows the balance
 * refetch rather than promising credits that have not landed.
 *
 * Stripe Checkout is a real redirect: the API returns a hosted URL and the
 * browser leaves. Success/cancel return to this page with `?credits=purchased`
 * or `?credits=cancelled`.
 */

interface CreditPack {
  key: string;
  name: string;
  credits: number;
  priceCents: number;
  description: string;
}

interface CreditBalance {
  plan: string;
  included: number;
  purchased: number;
  used: number;
  reserved: number;
  available: number;
  total: number;
  utilizationPercent: number;
  periodEnd: string;
}

interface LedgerRow {
  id: string;
  type: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

type Notice = { kind: "ok" | "err"; text: string } | null;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const perCredit = (pack: CreditPack) => `${(pack.priceCents / pack.credits).toFixed(2)}¢`;

const TYPE_LABEL: Record<string, string> = {
  purchase: "Purchase",
  usage: "Usage",
  refund: "Refund",
  adjustment: "Adjustment",
  rollover: "Monthly allocation",
  reservation_release: "Hold released",
};

function tone(type: string): string {
  if (type === "purchase" || type === "rollover" || type === "refund") return "text-brand-ink";
  return "text-ink";
}

export default function BuyCreditsPage() {
  return (
    <PageErrorBoundary pageName="Buy credits" backHref="/app/usage">
      <BuyCredits />
    </PageErrorBoundary>
  );
}

function BuyCredits() {
  const params = useSearchParams();
  const marker = params.get("credits");

  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [packsRes, balanceRes, historyRes] = await Promise.all([
        fetch("/api/credits/packs", { cache: "no-store" }),
        fetch("/api/credits/balance", { cache: "no-store" }),
        fetch("/api/credits/history?limit=25", { cache: "no-store" }),
      ]);
      if (!packsRes.ok) throw new Error(`Packs unavailable (${packsRes.status})`);
      const packsBody = await packsRes.json();
      setPacks((packsBody?.data ?? []) as CreditPack[]);

      if (balanceRes.ok) {
        const b = (await balanceRes.json())?.data as CreditBalance | undefined;
        setBalance(b ?? null);
      }
      if (historyRes.ok) {
        const h = (await historyRes.json())?.data as LedgerRow[] | undefined;
        setLedger(Array.isArray(h) ? h : []);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load the credit catalog.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The return-from-Stripe state. A refresh on success re-reads the balance so
  // the webhook's grant shows up without the founder guessing.
  useEffect(() => {
    if (marker === "purchased") {
      setNotice({
        kind: "ok",
        text: "Payment received. Your credits are applied by the payment webhook — if the balance has not moved yet, refresh in a moment.",
      });
      const t = setTimeout(() => void load(), 1500);
      return () => clearTimeout(t);
    }
    if (marker === "cancelled") {
      setNotice({ kind: "err", text: "Checkout cancelled — no payment was taken and no credits were charged." });
    }
  }, [marker, load]);

  const selectedPack = useMemo(
    () => packs.find((p) => p.key === selected) ?? null,
    [packs, selected],
  );

  async function buy(pack: CreditPack) {
    setNotice(null);
    setBuying(pack.key);
    try {
      const res = await fetch("/api/credits/purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: pack.key }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const code = body?.error?.code;
        const message =
          body?.error?.message ??
          (res.status === 403
            ? "Only an organization owner or admin can purchase credits."
            : "Could not start checkout.");
        setNotice({
          kind: "err",
          text: code === "rate_limited" ? `${message} Please wait a moment and try again.` : message,
        });
        return;
      }
      const url = body?.data?.url as string | undefined;
      if (!url) {
        setNotice({ kind: "err", text: "Checkout started but no payment URL was returned." });
        return;
      }
      // Real Stripe redirect — the browser leaves the app.
      window.location.href = url;
    } catch {
      setNotice({ kind: "err", text: "Network error starting checkout. Try again in a moment." });
    } finally {
      setBuying(null);
    }
  }

  return (
    <div id="main" className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Governance</p>
          <h1 className="mt-1 text-2xl font-semibold text-ink">Buy credits</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Work Credits fund every AI action. Buying more tops up this billing period; your plan
            allotment and any purchased credits are spent from one balance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-hairline px-3 text-sm text-muted transition-colors hover:border-brand-deep hover:text-brand-ink"
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
          Refresh
        </button>
      </header>

      {notice && (
        <div
          role="status"
          className={`mt-6 flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
            notice.kind === "ok"
              ? "border-brand bg-brand-soft text-brand-ink"
              : "border-border-error bg-error-soft text-error-ink"
          }`}
        >
          {notice.kind === "ok" ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{notice.text}</span>
        </div>
      )}

      {loadError && (
        <div role="status" className="mt-6 flex items-start gap-2 rounded-md border border-border-error bg-error-soft px-3 py-2 text-sm text-error-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{loadError}</span>
        </div>
      )}

      {/* Balance */}
      {balance && (
        <section className="mt-6 rounded-xl border border-hairline bg-white p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-canvas text-brand-ink">
                <Wallet className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm text-muted">Available now</p>
                <p className="text-2xl font-semibold text-ink">
                  {balance.available.toLocaleString()} <span className="text-base font-normal text-muted">credits</span>
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted">Plan</dt>
                <dd className="font-medium capitalize text-ink">{balance.plan}</dd>
              </div>
              <div>
                <dt className="text-muted">Included</dt>
                <dd className="font-medium text-ink">{balance.included.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted">Purchased</dt>
                <dd className="font-medium text-ink">{balance.purchased.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-muted">Used</dt>
                <dd className="font-medium text-ink">{balance.used.toLocaleString()}</dd>
              </div>
            </dl>
          </div>
        </section>
      )}

      {/* Packs */}
      <section className="mt-8">
        <h2 className="text-base font-semibold text-ink">Choose a pack</h2>
        <p className="mt-1 text-sm text-muted">
          Prices are set by ORQ8 and charged securely through Stripe. Larger packs cost less per
          credit.
        </p>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading packs…
          </div>
        ) : packs.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No credit packs are available right now. If this is unexpected, billing may not be
            configured on this deployment.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {packs.map((pack) => {
              const isSelected = selected === pack.key;
              return (
                <div
                  key={pack.key}
                  className={`flex flex-col rounded-xl border bg-white p-5 transition-colors ${
                    isSelected ? "border-brand-deep ring-2 ring-brand-deep/20" : "border-hairline"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(pack.key)}
                    className="text-left"
                    aria-pressed={isSelected}
                  >
                    <p className="text-sm font-semibold text-ink">{pack.name}</p>
                    <p className="mt-2 text-2xl font-semibold text-ink">{money(pack.priceCents)}</p>
                    <p className="mt-1 text-sm text-muted">
                      {pack.credits.toLocaleString()} credits · {perCredit(pack)} / credit
                    </p>
                    <p className="mt-2 text-xs text-muted">{pack.description}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => void buy(pack)}
                    disabled={buying !== null}
                    className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-brand-deep px-4 text-sm font-medium text-white transition-colors hover:bg-brand disabled:opacity-50"
                  >
                    {buying === pack.key ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Opening Stripe…
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" aria-hidden />
                        Buy {pack.name}
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {selectedPack && (
          <p className="mt-3 text-sm text-muted">
            Selected: <span className="font-medium text-ink">{selectedPack.name}</span> —{" "}
            {selectedPack.credits.toLocaleString()} credits for {money(selectedPack.priceCents)}.
          </p>
        )}
      </section>

      {/* Purchase history / ledger */}
      <section className="mt-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-ink">Credit history</h2>
          <Link href="/app/budgets" className="text-sm text-brand-ink underline hover:text-brand-deep">
            View budgets
          </Link>
        </div>
        <p className="mt-1 text-sm text-muted">
          Every credit movement for this billing period: purchases, usage, refunds and adjustments.
        </p>

        {ledger.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No credit activity yet this period.</p>
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-hairline bg-white">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Detail</th>
                  <th className="px-4 py-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((row) => (
                  <tr key={row.id} className="border-t border-hairline">
                    <td className="whitespace-nowrap px-4 py-2 text-muted">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </td>
                    <td className={`px-4 py-2 font-medium ${tone(row.type)}`}>
                      {TYPE_LABEL[row.type] ?? row.type}
                    </td>
                    <td className="px-4 py-2 text-muted">{row.description ?? "—"}</td>
                    <td className={`px-4 py-2 text-right font-medium ${row.amount >= 0 ? "text-brand-ink" : "text-ink"}`}>
                      {row.amount >= 0 ? "+" : ""}
                      {row.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
