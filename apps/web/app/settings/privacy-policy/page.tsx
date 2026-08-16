import { SettingsShell } from "../../../components/settings-shell";

export const metadata = { title: "Privacy Policy" };

const sections = [
  {
    h: "Your data is your data",
    body: "Everything your company produces, decides, and spends lives in your organization's workspace. It is not used to train shared models, sold, or shared with other organizations. You own it, you export it, and you can delete it.",
  },
  {
    h: "What we store",
    body: "Your account details, your organization's settings, the constitution and budget rules you set, and the audited record of agent actions. Provider keys are encrypted at rest and only masks are ever shown back to you.",
  },
  {
    h: "What agents touch",
    body: "Agents act only inside the systems you connect and under the approvals and budgets you set. Every action is logged with its reason, and you can pause or revoke access at any time.",
  },
  {
    h: "Deletion",
    body: "You can export everything and close your organization at any time. When you do, the workspace and its data are scheduled for deletion.",
  },
];

export default function PrivacyPage() {
  return (
    <SettingsShell
      title="Privacy policy"
      description="The short version: your organization is yours, not ours."
    >
      <div className="max-w-3xl space-y-6 rounded-xl border border-hairline bg-white p-6 sm:p-8">
        {sections.map((s) => (
          <section key={s.h}>
            <h2 className="text-sm font-semibold text-ink">{s.h}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
          </section>
        ))}
        <p className="border-t border-hairline pt-5 font-mono text-[10px] uppercase tracking-wide text-muted">
          Full legal copy drafts with the beta launch
        </p>
      </div>
    </SettingsShell>
  );
}
