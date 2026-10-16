import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// POST /api/billing/checkout — start a Stripe Checkout Session for a plan.
// Body is `{ plan: "founder" | "team" | "company", billing_cycle?: "monthly" | "annual" }`;
// the API owns prices and returns the Stripe redirect URL. The browser never
// sees a price it could tamper with — it only names a plan.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/billing/checkout", { method: "POST", body });
}
