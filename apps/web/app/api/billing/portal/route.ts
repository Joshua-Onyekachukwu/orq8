import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// POST /api/billing/portal — open the Stripe Customer Portal for the org's
// active subscription (manage payment method, cancel, invoices).
export async function POST(request: NextRequest) {
  return proxyApiJson(request, "/v1/billing/portal", { method: "POST", body: {} });
}
