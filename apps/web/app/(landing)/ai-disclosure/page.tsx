import type { Metadata } from "next";
import LegalLayout from "@/components/landing/Legal/LegalLayout";

export const metadata: Metadata = {
  title: "AI Transparency Notice — ORQ8",
  description:
    "ORQ8 AI Transparency Notice. Understand how AI works in ORQ8, your rights, and your control.",
};

export default function AIDisclosurePage() {
  return (
    <LegalLayout
      title="AI Transparency Notice"
      lastUpdated="September 8, 2026"
    >
      <section>
        <h2>What ORQ8 Is</h2>
        <p>
          ORQ8 is an AI-powered organization operating system. It uses artificial
          intelligence to help founders manage their companies by creating and
          coordinating AI employees that perform work under human direction and
          governance.
        </p>
        <p>
          This notice explains how AI works within ORQ8, what decisions AI makes,
          what decisions humans make, and your rights and controls.
        </p>
      </section>

      <section>
        <h2>How AI Works in ORQ8</h2>

        <h3>The Executive Agent</h3>
        <p>
          The Executive Agent is an AI system that serves as your chief of staff. It:
        </p>
        <ul>
          <li>Understands your organizational structure (departments, teams, agents)</li>
          <li>Analyzes your goals, strategy, and current work</li>
          <li>Recommends actions, assignments, and organizational changes</li>
          <li>Executes approved actions through verified tool calls</li>
          <li>Reports outcomes truthfully based on verified database state</li>
        </ul>

        <h3>AI Employees</h3>
        <p>
          AI employees are specialized AI agents configured for specific roles.
          They:
        </p>
        <ul>
          <li>Operate within defined capabilities and responsibilities</li>
          <li>Work within autonomy levels set by the founder</li>
          <li>Execute tasks and report results</li>
          <li>Have their performance tracked over time</li>
        </ul>
      </section>

      <section>
        <h2>What AI Decides vs. What Humans Decide</h2>
        <div className="ai-disclosure-grid">
          <div>
            <h3>AI Decides</h3>
            <ul>
              <li>How to interpret your natural-language requests</li>
              <li>Which tools to use for a given task</li>
              <li>How to structure work within approved parameters</li>
              <li>Recommendations for organizational improvements</li>
              <li>How to prioritize within assigned scope</li>
            </ul>
          </div>
          <div>
            <h3>Humans Decide</h3>
            <ul>
              <li>Company direction, strategy, and goals</li>
              <li>Approval of significant actions</li>
              <li>Autonomy levels for AI employees</li>
              <li>Hiring, pausing, or retiring AI employees</li>
              <li>Accepting or rejecting AI recommendations</li>
              <li>Final approval on published content or external actions</li>
            </ul>
          </div>
        </div>
      </section>

      <section>
        <h2>Your Controls</h2>
        <ul>
          <li><strong>Autonomy levels:</strong> You set how much authority each AI employee has. Higher autonomy means less human approval needed; lower autonomy means more</li>
          <li><strong>Approval requirements:</strong> You can require explicit approval for specific types of actions (e.g., publishing, spending, external communications)</li>
          <li><strong>Access controls:</strong> You define which AI employees can access which departments, teams, and data</li>
          <li><strong>Pause or retire:</strong> You can pause or retire any AI employee at any time</li>
          <li><strong>Decision history:</strong> All significant decisions and their rationale are recorded and retrievable</li>
          <li><strong>Audit trail:</strong> Every action by every AI employee is logged with full context</li>
          <li><strong>Data control:</strong> You own your data and can export or delete it at any time</li>
        </ul>
      </section>

      <section>
        <h2>AI Limitations</h2>
        <ul>
          <li>AI-generated content may contain errors and should be reviewed before use</li>
          <li>AI recommendations are based on the data available and may not account for factors outside the system</li>
          <li>AI employees do not have judgment equivalent to human professionals — they operate within configured parameters</li>
          <li>The quality of AI output depends on the quality of input, context, and configuration you provide</li>
          <li>AI cannot make final business decisions — the founder retains authority over all significant choices</li>
        </ul>
      </section>

      <section>
        <h2>Model Information</h2>
        <ul>
          <li><strong>AI model provider:</strong> NVIDIA NIM (large language model inference)</li>
          <li><strong>Model training:</strong> Your data is NOT used to train AI models</li>
          <li><strong>Data processing:</strong> Organizational context is sent to the AI model for inference only</li>
          <li><strong>Model changes:</strong> We may update AI models to improve performance. We will notify you of material changes to the AI systems that affect how the Service operates</li>
        </ul>
      </section>

      <section>
        <h2>Human Oversight</h2>
        <p>
          ORQ8 is designed to operate under human oversight. The founder is always
          in control. AI employees execute work, but the founder:
        </p>
        <ul>
          <li>Sets the direction and goals</li>
          <li>Defines the boundaries of AI authority</li>
          <li>Approves significant actions</li>
          <li>Can intervene at any time</li>
          <li>Reviews outcomes and adjusts the system</li>
        </ul>
        <p>
          No AI employee in ORQ8 operates fully autonomously without any human
          oversight. The degree of human involvement is configurable but never
          zero.
        </p>
      </section>

      <section>
        <h2>EU AI Act Compliance</h2>
        <p>
          ORQ8 is committed to complying with the European Union AI Act. The
          AI systems in ORQ8 are designed to:
        </p>
        <ul>
          <li>Operate under meaningful human oversight</li>
          <li>Be transparent about their capabilities and limitations</li>
          <li>Record and make available the rationale for significant decisions</li>
          <li>Allow founders to override, correct, or shut down AI operations</li>
          <li>Maintain audit trails for accountability</li>
        </ul>
      </section>

      <section>
        <h2>Changes to AI Systems</h2>
        <p>
          We may update AI models, capabilities, and governance systems over time.
          Material changes to how AI operates within the Service will be communicated
          in advance through product updates and this notice will be updated
          accordingly.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>For questions about AI in ORQ8:</p>
        <ul>
          <li><strong>General inquiries:</strong> <a href="mailto:hello@orq8.com">hello@orq8.com</a></li>
          <li><strong>AI-related concerns:</strong> <a href="mailto:ai-ethics@orq8.com">ai-ethics@orq8.com</a></li>
          <li><strong>Privacy concerns:</strong> <a href="mailto:privacy@orq8.com">privacy@orq8.com</a></li>
        </ul>
      </section>
    </LegalLayout>
  );
}
