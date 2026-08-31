import type { Metadata } from "next";
import Pricing from "@/components/landing/Common/Pricing";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "ORQ8 pricing — Founder, Team, Company, and Enterprise plans. Every plan starts with a 7-day free trial. No per-agent commissions.",
};

export default function PricingPage() {
  return <Pricing />;
}
