import { redirect } from "next/navigation";

/**
 * `/admin/jobs` used to render a hard-coded list of "background jobs" with
 * invented schedules. The real queue console is `/admin/commands`, so this
 * route keeps working for anyone with the old link and sends them there.
 */
export default function AdminJobsRedirect() {
  redirect("/admin/commands");
}
