import type { Metadata } from "next";

import { Board } from "../../components/dashboard-prototype/components/board";
import { PrototypeProvider } from "../../components/dashboard-prototype/state/store";

/**
 * An isolated prototype of a new company operating view, for review only.
 *
 * - Outside /app and outside the (landing) group, so it inherits nothing but
 *   the root layout.
 * - Not listed in middleware PROTECTED_ROUTES or ADMIN_ROUTES.
 * - Reads no company data, calls no API, and shares no mutable state with the
 *   product. The organisation, work and activity are invented (NovaForge AI)
 *   and live in memory for the length of the visit.
 */
export const metadata: Metadata = {
  title: "Dashboard prototype · ORQ8",
  description:
    "An isolated, interactive prototype of a new ORQ8 company operating view, built for review with simulated data.",
  robots: { index: false, follow: false },
};

export default function DashboardPrototypePage() {
  return (
    <PrototypeProvider>
      <Board />
    </PrototypeProvider>
  );
}
