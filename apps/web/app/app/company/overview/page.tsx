import { redirect } from "next/navigation";

/**
 * B6: the Company Hub moved out of /app to /app/company (its own profile /
 * goals / org / metrics page). This route now redirects so old links,
 * bookmarks and the proof script's history keep working.
 */
export default function CompanyOverviewRedirect() {
  redirect("/app/company");
}
