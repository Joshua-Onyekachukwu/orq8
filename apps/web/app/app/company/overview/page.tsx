import { redirect } from "next/navigation";

/**
 * AUD-001: the Company Hub merged into /app (one home). This route now
 * redirects so old links, bookmarks and the proof script's history keep
 * working. The hub's guides (first-run welcome, first-value checklist) and
 * the CompanyOrbit console live in apps/web/app/app/page.tsx.
 */
export default function CompanyOverviewRedirect() {
  redirect("/app");
}
