import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ProvidersClient, type CatalogItem, type KeyItem } from "../../../components/providers-client";
import { API_URL, SESSION_COOKIE } from "../../../lib/api";

export const dynamic = "force-dynamic";
export const metadata = { title: "Providers" };

// docs/23.3 — settings UX: provider cards, masked keys, add/rotate/revoke/test.
// Full keys never reach this server component — the API returns masks only.
export default async function SettingsProvidersPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const headers = { cookie: `${SESSION_COOKIE}=${token}` };
  const [catalogRes, keysRes] = await Promise.all([
    fetch(`${API_URL}/v1/providers`, { headers, cache: "no-store" }),
    fetch(`${API_URL}/v1/providers/keys`, { headers, cache: "no-store" }),
  ]);

  if (!catalogRes.ok || !keysRes.ok) redirect("/login");

  const catalog = (((await catalogRes.json()) as { data?: CatalogItem[] }).data ?? []) as CatalogItem[];
  const keys = (((await keysRes.json()) as { data?: KeyItem[] }).data ?? []) as KeyItem[];

  return (
    <div id="main" className="min-h-screen bg-canvas">
      <header className="border-b border-hairline bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <a href="/" className="text-lg font-semibold tracking-tight text-navy-900">
            ORQ8
          </a>
          <a
            href="/app"
            className="rounded-md border border-hairline px-3 py-1.5 text-sm text-muted transition-colors hover:border-navy-800 hover:text-navy-800"
          >
            ← Back to app
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="text-sm text-muted">Settings</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">Model providers</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Bring your own keys (BYOK). Keys are encrypted at rest (AES-256-GCM) and never shown
          again after saving — only a mask is stored and displayed. Access is audited.
        </p>
        <ProvidersClient catalog={catalog} keys={keys} />
      </main>
    </div>
  );
}
