import type { Metadata } from "next";
import LegalLayout from "@/components/landing/Legal/LegalLayout";

export const metadata: Metadata = {
  title: "Security — ORQ8",
  description:
    "ORQ8 Security Practices. Learn how we protect your data, your organization, and your AI workforce.",
};

export default function SecurityPage() {
  return (
    <LegalLayout
      title="Security Practices"
      lastUpdated="September 8, 2026"
    >
      <section>
        <h2>Our Commitment</h2>
        <p>
          Security is foundational to ORQ8. As an AI-powered platform that manages
          your organizational structure, AI employees, strategy, and decision-making,
          we understand the critical responsibility of protecting your data and
          ensuring the integrity of your operations.
        </p>
      </section>

      <section>
        <h2>Infrastructure Security</h2>
        <div className="security-grid">
          <div>
            <h3>Hosting</h3>
            <ul>
              <li><strong>Compute:</strong> Railway — SOC 2 Type II compliant infrastructure</li>
              <li><strong>Database:</strong> Supabase (PostgreSQL) — encrypted at rest, automated backups</li>
              <li><strong>Frontend:</strong> Vercel — edge network with DDoS protection</li>
            </ul>
          </div>
          <div>
            <h3>Encryption</h3>
            <ul>
              <li><strong>In transit:</strong> TLS 1.3 for all communications</li>
              <li><strong>At rest:</strong> AES-256 encryption for stored data</li>
              <li><strong>API keys:</strong> Encrypted with application-level encryption, never exposed to clients</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2>Authentication & Access Control</h2>
        <ul>
          <li><strong>Password hashing:</strong> Argon2id — the current industry standard for adaptive password hashing, resistant to GPU-based attacks</li>
          <li><strong>Session management:</strong> Secure, HttpOnly cookies with CSRF protection</li>
          <li><strong>Brute-force protection:</strong> Account lockout after repeated failed attempts with progressive delays</li>
          <li><strong>Rate limiting:</strong> API rate limits prevent abuse and denial-of-service attacks</li>
          <li><strong>Platform admin access:</strong> Restricted to designated administrators via email allowlist and database role</li>
        </ul>
      </section>

      <section>
        <h2>Data Isolation</h2>
        <ul>
          <li><strong>Row-Level Security (RLS):</strong> PostgreSQL RLS policies enforce strict tenant isolation at the database level — your organization&apos;s data is physically inaccessible to other organizations</li>
          <li><strong>Organization-scoped queries:</strong> Every API request is scoped to the authenticated user&apos;s organization</li>
          <li><strong>Cross-tenant protection:</strong> All tool executions, EA operations, and API calls verify organization ownership before any data access</li>
          <li><strong>Admin isolation:</strong> Platform administrators have read-only oversight access but cannot access or modify individual organization data beyond administrative functions</li>
        </ul>
      </section>

      <section>
        <h2>AI Security</h2>
        <ul>
          <li><strong>Prompt injection resistance:</strong> The Executive Agent includes defenses against prompt injection attacks that attempt to bypass governance or authorization</li>
          <li><strong>Tool authorization:</strong> Every EA tool execution passes through permission checks, approval gates, and governance rules before any database mutation</li>
          <li><strong>Autonomy boundaries:</strong> AI employees operate within configurable autonomy levels. High-risk operations require explicit founder approval</li>
          <li><strong>Execution verification:</strong> The EA verifies that operations actually succeeded in the database before reporting success to the founder</li>
          <li><strong>Audit trail:</strong> All EA tool executions are logged with request, intent, tool, arguments, authorization result, and outcome</li>
          <li><strong>No training on your data:</strong> Your organizational data is not used to train AI models</li>
        </ul>
      </section>

      <section>
        <h2>Application Security</h2>
        <ul>
          <li><strong>CSRF protection:</strong> Cross-site request forgery tokens on all state-changing operations</li>
          <li><strong>Input validation:</strong> Server-side validation of all inputs using Zod schemas</li>
          <li><strong>SQL injection prevention:</strong> Parameterized queries via Drizzle ORM — no raw SQL concatenation</li>
          <li><strong>Error handling:</strong> Structured error responses that never expose internal implementation details</li>
          <li><strong>Dependency auditing:</strong> Regular dependency updates and vulnerability scanning</li>
        </ul>
      </section>

      <section>
        <h2>Monitoring & Incident Response</h2>
        <ul>
          <li><strong>Audit logging:</strong> Comprehensive audit trails for all significant operations</li>
          <li><strong>Error tracking:</strong> Structured error logging with context for rapid diagnosis</li>
          <li><strong>Health monitoring:</strong> Automated health checks for all service components</li>
          <li><strong>Incident response:</strong> Documented incident response procedures with 72-hour breach notification (GDPR compliant)</li>
        </ul>
      </section>

      <section>
        <h2>Compliance</h2>
        <ul>
          <li><strong>GDPR:</strong> Full compliance with data subject rights, data processing agreements, and cross-border transfer mechanisms</li>
          <li><strong>CCPA:</strong> Compliance with California consumer privacy rights</li>
          <li><strong>Data Processing:</strong> Sub-processor agreements with all infrastructure providers</li>
          <li><strong>Data minimization:</strong> We collect only the data necessary to provide the Service</li>
        </ul>
      </section>

      <section>
        <h2>Responsible Disclosure</h2>
        <p>
          If you discover a security vulnerability in ORQ8, please report it
          responsibly by emailing{" "}
          <a href="mailto:security@orq8.com">security@orq8.com</a>. We will
          acknowledge your report within 48 hours and work with you to understand
          and address the issue. We do not offer bug bounties at this time but
          appreciate responsible disclosure.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>For security-related inquiries:</p>
        <ul>
          <li><strong>Security issues:</strong> <a href="mailto:security@orq8.com">security@orq8.com</a></li>
          <li><strong>Privacy concerns:</strong> <a href="mailto:privacy@orq8.com">privacy@orq8.com</a></li>
          <li><strong>Data Protection Officer:</strong> <a href="mailto:dpo@orq8.com">dpo@orq8.com</a></li>
        </ul>
      </section>
    </LegalLayout>
  );
}
