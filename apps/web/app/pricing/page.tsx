import type { Metadata } from "next";
import { PricingPage } from "./pricing-client";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "One platform price. You own the models. Free, Pro $49/mo, Business $199/mo, Enterprise — no per-agent commissions, no agent marketplace, ever.",
};

export default function Page() {
  return <PricingPage />;
}
