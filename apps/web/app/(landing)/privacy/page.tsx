import type { Metadata } from "next";
import LegalLayout from "@/components/landing/Legal/LegalLayout";

export const metadata: Metadata = {
  title: "Privacy Policy — ORQ8",
  description:
    "ORQ8 Privacy Policy. Learn how we collect, use, protect, and share your data.",
};

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="September 8, 2026"
    >
      <section>
        <h2>1. Introduction</h2>
        <p>
          ORQ8 (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the ORQ8 platform
          (the &quot;Service&quot;), an AI-powered organization operating system that helps
          founders manage their companies through AI employees and an Executive Agent.
        </p>
        <p>
          This Privacy Policy explains how we collect, use, disclose, and safeguard
          your information when you use our Service. By using the Service, you agree
          to the collection and use of information in accordance with this policy.
        </p>
        <p>
          We comply with the General Data Protection Regulation (GDPR), the California
          Consumer Privacy Act (CCPA), and other applicable data protection laws.
        </p>
      </section>

      <section>
        <h2>2. Data We Collect</h2>
        <h3>2.1 Account Information</h3>
        <ul>
          <li>Name and email address</li>
          <li>Authentication credentials (passwords are hashed with Argon2id)</li>
          <li>Organization/company name and details you provide</li>
          <li>Profile information you choose to share</li>
        </ul>

        <h3>2.2 Organization Data</h3>
        <ul>
          <li>Department structure, team configurations, and organizational hierarchy</li>
          <li>AI employee definitions, roles, capabilities, and assignments</li>
          <li>Goals, tasks, strategies, and key results you create</li>
          <li>Decision records, rationale, and outcomes</li>
          <li>Agent performance data, workload metrics, and utilization information</li>
          <li>Company health metrics and workforce intelligence data</li>
        </ul>

        <h3>2.3 Usage Data</h3>
        <ul>
          <li>Pages visited, features used, and interaction patterns</li>
          <li>Executive Agent conversations and tool executions</li>
          <li>API request logs (retained for 30 days)</li>
          <li>Browser type, device information, and IP address</li>
        </ul>

        <h3>2.4 AI-Generated Content</h3>
        <ul>
          <li>Content created by AI employees during task execution</li>
          <li>Executive Agent recommendations and analysis</li>
          <li>Generated reports, summaries, and organizational insights</li>
        </ul>

        <h3>2.5 Integration Data</h3>
        <ul>
          <li>API keys and credentials for third-party services you connect</li>
          <li>Data from connected services (only accessed when you authorize it)</li>
        </ul>
      </section>

      <section>
        <h2>3. How We Use Your Data</h2>
        <ul>
          <li><strong>Provide the Service:</strong> Operate, maintain, and improve the ORQ8 platform</li>
          <li><strong>Execute your instructions:</strong> Run AI employees, execute tasks, and manage your organization as directed</li>
          <li><strong>AI processing:</strong> Send organizational context to AI models (currently NVIDIA NIM) to generate responses, recommendations, and execute work</li>
          <li><strong>Security:</strong> Detect fraud, abuse, and unauthorized access</li>
          <li><strong>Communication:</strong> Send service-related emails, security alerts, and product updates</li>
          <li><strong>Analytics:</strong> Understand usage patterns to improve the product (aggregated, anonymized)</li>
          <li><strong>Legal compliance:</strong> Meet regulatory obligations including GDPR, CCPA, and audit requirements</li>
        </ul>
      </section>

      <section>
        <h2>4. AI and Your Data</h2>
        <p>
          ORQ8 uses artificial intelligence to power your Executive Agent and AI employees.
          Here is how your data interacts with AI systems:
        </p>
        <ul>
          <li><strong>Organizational context</strong> (departments, teams, agents, goals, tasks, strategy) is sent to AI models to enable the Executive Agent to understand and manage your company</li>
          <li><strong>AI model provider:</strong> Currently NVIDIA NIM. Your data is processed according to NVIDIA&apos;s data processing terms</li>
          <li><strong>Model training:</strong> Your data is <strong>not</strong> used to train AI models. We do not allow our AI providers to use your data for model training</li>
          <li><strong>Data retention in AI context:</strong> Conversation context is maintained during active sessions. Historical conversations are stored in your organization&apos;s decision memory</li>
          <li><strong>Human oversight:</strong> All significant actions by AI employees require your approval or fall within autonomy boundaries you set</li>
        </ul>
      </section>

      <section>
        <h2>5. Data Sharing and Disclosure</h2>
        <p>We do not sell your personal data. We may share data only in these circumstances:</p>
        <ul>
          <li><strong>Service providers:</strong> Trusted third parties that help us operate the Service (see Sub-processors section below)</li>
          <li><strong>Legal requirements:</strong> When required by law, court order, or governmental request</li>
          <li><strong>Safety:</strong> To protect the rights, property, or safety of ORQ8, our users, or the public</li>
          <li><strong>Business transfers:</strong> In connection with a merger, acquisition, or sale of assets (you will be notified before your data becomes subject to a different privacy policy)</li>
          <li><strong>With your consent:</strong> When you explicitly authorize sharing</li>
        </ul>
      </section>

      <section>
        <h2>6. Data Security</h2>
        <ul>
          <li>All data is encrypted in transit (TLS 1.3) and at rest (AES-256)</li>
          <li>Passwords are hashed with Argon2id (industry-leading adaptive hashing)</li>
          <li>Row-Level Security (RLS) ensures strict tenant isolation — your data is never accessible to other organizations</li>
          <li>API keys and secrets are encrypted at rest and never exposed to the client</li>
          <li>CSRF protection, brute-force lockout, and rate limiting are enforced</li>
          <li>Audit trails record all significant actions for accountability</li>
          <li>Regular security assessments and dependency audits</li>
        </ul>
      </section>

      <section>
        <h2>7. Data Retention</h2>
        <ul>
          <li><strong>Account data:</strong> Retained while your account is active, deleted within 30 days of account closure</li>
          <li><strong>Organization data:</strong> Retained while your organization is active, deleted within 30 days of organization deletion</li>
          <li><strong>API logs:</strong> Retained for 30 days for security and debugging</li>
          <li><strong>Audit trails:</strong> Retained for 90 days for compliance</li>
          <li><strong>Decision memory:</strong> Retained as part of your organization&apos;s knowledge base until you delete it or close your account</li>
          <li><strong>Backups:</strong> Automated backups are purged within 30 days</li>
        </ul>
      </section>

      <section>
        <h2>8. Your Rights</h2>
        <p>Depending on your jurisdiction, you have the following rights:</p>

        <h3>8.1 GDPR Rights (EU/EEA Users)</h3>
        <ul>
          <li><strong>Right of access:</strong> Request a copy of the personal data we hold about you</li>
          <li><strong>Right to rectification:</strong> Request correction of inaccurate data</li>
          <li><strong>Right to erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
          <li><strong>Right to restrict processing:</strong> Request limitation of how we process your data</li>
          <li><strong>Right to data portability:</strong> Receive your data in a structured, machine-readable format</li>
          <li><strong>Right to object:</strong> Object to processing based on legitimate interests</li>
          <li><strong>Right to withdraw consent:</strong> Where processing is based on consent, withdraw at any time</li>
          <li><strong>Right to lodge a complaint:</strong> File a complaint with your local Data Protection Authority</li>
        </ul>

        <h3>8.2 CCPA Rights (California Residents)</h3>
        <ul>
          <li><strong>Right to know:</strong> What personal information we collect, use, and disclose</li>
          <li><strong>Right to delete:</strong> Request deletion of personal information</li>
          <li><strong>Right to opt out:</strong> We do not sell personal information, but you may submit a verifiable request</li>
          <li><strong>Right to non-discrimination:</strong> We will not discriminate against you for exercising your rights</li>
        </ul>

        <p>
          To exercise any of these rights, contact us at{" "}
          <a href="mailto:privacy@orq8.com">privacy@orq8.com</a>. We will respond
          within 30 days (or sooner as required by applicable law).
        </p>
      </section>

      <section>
        <h2>9. International Data Transfers</h2>
        <p>
          Your data may be processed in countries outside your own. Our infrastructure
          providers (Railway, Supabase, Vercel) operate globally. When transferring
          data internationally, we rely on:
        </p>
        <ul>
          <li>Standard Contractual Clauses (SCCs) where required by GDPR</li>
          <li>Adequacy decisions where applicable</li>
          <li>Your explicit consent where other mechanisms are not available</li>
        </ul>
      </section>

      <section>
        <h2>10. Cookies</h2>
        <p>We use the following types of cookies:</p>
        <ul>
          <li><strong>Essential cookies:</strong> Required for authentication and security (session cookies). These cannot be disabled.</li>
          <li><strong>Functional cookies:</strong> Remember your preferences (e.g., sidebar state, launcher position). These improve your experience but are not strictly required.</li>
        </ul>
        <p>
          We do not use advertising or tracking cookies. You can manage cookie
          preferences through the cookie consent banner displayed on your first visit
          or through your browser settings.
        </p>
      </section>

      <section>
        <h2>11. Sub-processors</h2>
        <p>We use the following third-party services that may process your data:</p>
        <ul>
          <li><strong>Supabase</strong> — Database hosting and authentication (PostgreSQL)</li>
          <li><strong>Railway</strong> — Application hosting and compute</li>
          <li><strong>Vercel</strong> — Frontend hosting and edge network</li>
          <li><strong>NVIDIA NIM</strong> — AI model inference (LLM processing)</li>
          <li><strong>GitHub</strong> — Source code management and CI/CD</li>
        </ul>
        <p>
          We will notify you of any changes to our sub-processors. All sub-processors
          are bound by data processing agreements.
        </p>
      </section>

      <section>
        <h2>12. Children&apos;s Privacy</h2>
        <p>
          The Service is not intended for use by individuals under 18 years of age.
          We do not knowingly collect personal data from children. If we learn that
          we have collected data from a child, we will delete it promptly.
        </p>
      </section>

      <section>
        <h2>13. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. We will notify you
          of material changes by email or through the Service at least 30 days
          before the changes take effect. Continued use of the Service after
          changes take effect constitutes acceptance of the updated policy.
        </p>
      </section>

      <section>
        <h2>14. Contact Us</h2>
        <p>If you have questions about this Privacy Policy or our data practices:</p>
        <ul>
          <li><strong>Email:</strong> <a href="mailto:privacy@orq8.com">privacy@orq8.com</a></li>
          <li><strong>Data Protection Officer:</strong> <a href="mailto:dpo@orq8.com">dpo@orq8.com</a></li>
        </ul>
      </section>
    </LegalLayout>
  );
}
