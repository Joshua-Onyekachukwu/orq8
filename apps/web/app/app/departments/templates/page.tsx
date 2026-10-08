import type { Metadata } from "next";
import { fetchWithAuth } from "../../../../lib/api";
import { PageShell } from "../../../../components/page-shell";
import { OsPageHeader } from "../../../../components/os/structure";
import {
  TemplateCatalog,
  type DepartmentTemplateRow,
} from "../../../../components/work/template-catalog";

export const metadata: Metadata = {
  title: "Department templates",
  description:
    "Establish a department from a template — its roles, KPIs and page emphasis come with it.",
};

interface DepartmentRow {
  id: string;
  name: string;
  status: string;
}

/**
 * Department template catalog (docs/85 P2).
 *
 * `revalidate: false`: activation changes the org's shape, and a cached catalog
 * would let a founder activate a department that a teammate just established.
 * Both reads are real; nothing is seeded to make the page look busy.
 */
export default async function DepartmentTemplatesPage() {
  const [templates, departments] = await Promise.all([
    fetchWithAuth<DepartmentTemplateRow[]>("/v1/department-templates", { revalidate: false }),
    fetchWithAuth<DepartmentRow[]>("/v1/departments", { revalidate: false }),
  ]);

  const rows = templates ?? [];
  const activeNames = (departments ?? [])
    .filter((d) => d.status !== "archived")
    .map((d) => d.name);

  return (
    <PageShell pageName="Department templates" backHref="/app/departments">
      <div className="flex flex-col gap-6">
        <OsPageHeader
          eyebrow="Establish"
          title="Department templates"
          breadcrumbs={[
            { label: "Company", href: "/app" },
            { label: "Departments", href: "/app/departments" },
            { label: "Templates" },
          ]}
          description="A template establishes a real department — its roles, its teams, the KPIs it is judged on, and the emphasis its page leads with. Activation is idempotent: establishing a department you already have reuses it."
          meta={
            <>
              <span>{rows.length} templates</span>
              <span>{activeNames.length} established</span>
            </>
          }
        />
        <TemplateCatalog templates={rows} activeDepartmentNames={activeNames} />
      </div>
    </PageShell>
  );
}
