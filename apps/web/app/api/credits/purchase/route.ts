import { NextRequest } from "next/server";
import { proxyApiJson } from "../../../../lib/api";

// POST /api/credits/purchase — start a Stripe Checkout for a credit pack.
// Body is `{ pack: "<key>" }` only; the API owns the price and the credit
// quantity, and credits are granted by the verified webhook, never here.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  return proxyApiJson(request, "/v1/credits/purchase", { method: "POST", body });
}
