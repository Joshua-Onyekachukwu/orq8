import { Settings } from "lucide-react";

export const metadata = { title: "Settings — Admin — ORQ8" };

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-ink">Admin Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Platform configuration and administrative controls.
        </p>
      </div>

      <div className="space-y-6">
        {/* Platform settings */}
        <div className="rounded-xl border border-hairline bg-white p-6">
          <h2 className="text-sm font-semibold text-ink mb-4">Platform</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Registration</p>
                <p className="text-xs text-muted">Allow new user signups</p>
              </div>
              <span className="rounded-full bg-emerald/10 px-2.5 py-0.5 text-xs font-medium text-emerald">
                Open
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Maintenance Mode</p>
                <p className="text-xs text-muted">Temporarily disable access</p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                Off
              </span>
            </div>
          </div>
        </div>

        {/* AI Model settings */}
        <div className="rounded-xl border border-hairline bg-white p-6">
          <h2 className="text-sm font-semibold text-ink mb-4">AI Models</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Default Model</p>
                <p className="text-xs text-muted">Model used for general tasks</p>
              </div>
              <span className="font-mono text-xs text-muted">GPT-4o</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">BYOK (Bring Your Own Key)</p>
                <p className="text-xs text-muted">Allow users to use their own API keys</p>
              </div>
              <span className="rounded-full bg-emerald/10 px-2.5 py-0.5 text-xs font-medium text-emerald">
                Enabled
              </span>
            </div>
          </div>
        </div>

        {/* Security settings */}
        <div className="rounded-xl border border-hairline bg-white p-6">
          <h2 className="text-sm font-semibold text-ink mb-4">Security</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Rate Limiting</p>
                <p className="text-xs text-muted">Login: 5 attempts/min per IP</p>
              </div>
              <span className="rounded-full bg-emerald/10 px-2.5 py-0.5 text-xs font-medium text-emerald">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Security Headers</p>
                <p className="text-xs text-muted">HSTS, CSP, X-Frame-Options</p>
              </div>
              <span className="rounded-full bg-emerald/10 px-2.5 py-0.5 text-xs font-medium text-emerald">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Password Reset</p>
                <p className="text-xs text-muted">Allow users to reset passwords</p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                Coming Soon
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
