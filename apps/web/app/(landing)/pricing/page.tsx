import type { Metadata } from "next";
import PricingHero from "@/components/landing/Common/PricingHero";
import Pricing from "@/components/landing/Common/Pricing";

export const metadata: Metadata = {
  title: "Pricing — ORQ8",
  description:
    "ORQ8 pricing — Founder, Team, Company, and Enterprise plans. Every plan starts with a 7-day free trial. No per-agent commissions.",
};

export default function PricingPage() {
  return (
    <>
      <PricingHero />
      <Pricing />
    </>
  );
}
