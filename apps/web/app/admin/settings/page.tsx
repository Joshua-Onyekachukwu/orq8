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
              <span className="rounded-full bg-orq8-green/10 px-2.5 py-0.5 text-xs font-medium text-orq8-lime">
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
                <p className="text-sm font-medium text-ink">Default Gateway</p>
                <p className="text-xs text-muted">LiteLLM proxy for model routing</p>
              </div>
              <span className="font-mono text-xs text-muted">
                {process.env.LITELLM_BASE_URL ? "Connected" : "Not configured"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">BYOK (Bring Your Own Key)</p>
                <p className="text-xs text-muted">Allow users to use their own API keys</p>
              </div>
              <span className="rounded-full bg-orq8-green/10 px-2.5 py-0.5 text-xs font-medium text-orq8-lime">
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
              <span className="rounded-full bg-orq8-green/10 px-2.5 py-0.5 text-xs font-medium text-orq8-lime">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Security Headers</p>
                <p className="text-xs text-muted">HSTS, CSP, X-Frame-Options</p>
              </div>
              <span className="rounded-full bg-orq8-green/10 px-2.5 py-0.5 text-xs font-medium text-orq8-lime">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Password Reset</p>
                <p className="text-xs text-muted">Email-based token reset flow</p>
              </div>
              <span className="rounded-full bg-orq8-green/10 px-2.5 py-0.5 text-xs font-medium text-orq8-lime">
                Active
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Idempotency</p>
                <p className="text-xs text-muted">Redis-backed for mutating endpoints</p>
              </div>
              <span className="rounded-full bg-orq8-green/10 px-2.5 py-0.5 text-xs font-medium text-orq8-lime">
                Active
              </span>
            </div>
          </div>
        </div>

        {/* External services */}
        <div className="rounded-xl border border-hairline bg-white p-6">
          <h2 className="text-sm font-semibold text-ink mb-4">External Services</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Stripe Billing</p>
                <p className="text-xs text-muted">Subscriptions and payment processing</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                process.env.STRIPE_SECRET_KEY ? "bg-orq8-green/10 text-orq8-lime" : "bg-gray-100 text-gray-500"
              }`}>
                {process.env.STRIPE_SECRET_KEY ? "Configured" : "Not configured"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">SMTP (Email)</p>
                <p className="text-xs text-muted">Transactional and drip emails</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                process.env.SMTP_HOST ? "bg-orq8-green/10 text-orq8-lime" : "bg-gray-100 text-gray-500"
              }`}>
                {process.env.SMTP_HOST ? "Configured" : "Not configured"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">File Storage (S3/R2)</p>
                <p className="text-xs text-muted">Agent file uploads and documents</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                process.env.S3_ENDPOINT ? "bg-orq8-green/10 text-orq8-lime" : "bg-blue-50 text-blue-600"
              }`}>
                {process.env.S3_ENDPOINT ? "S3/R2" : "Local fallback"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-ink">Redis</p>
                <p className="text-xs text-muted">Sessions, rate limiting, idempotency</p>
              </div>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                process.env.REDIS_URL ? "bg-orq8-green/10 text-orq8-lime" : "bg-blue-50 text-blue-600"
              }`}>
                {process.env.REDIS_URL ? "Connected" : "In-memory fallback"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
