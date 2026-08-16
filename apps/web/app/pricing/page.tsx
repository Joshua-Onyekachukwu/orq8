import type { Metadata } from "next";
import { PricingPage } from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Every plan starts with 7 days free. Starter, Pro $49/mo, Business $199/mo, Enterprise. You own the models. No per-agent commissions, no agent marketplace, ever.",
};

export default function Page() {
  return <PricingPage />;
}
