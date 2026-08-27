"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
} from "lucide-react";

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
}

const steps: OnboardingStep[] = [
  {
    id: "organization",
    title: "Create your organization",
    description: "Set up your AI company's foundation",
  },
  {
    id: "constitution",
    title: "Choose your constitution",
    description: "Define how your AI organization operates",
  },
  {
    id: "agents",
    title: "Hire your first AI team",
    description: "Select the specialists for your organization",
  },
];

const constitutionTypes = [
  {
    type: "founder_led" as const,
    name: "Founder-Led",
    description: "Maximum control. All significant decisions route to you. Best for early-stage companies where you want full oversight.",
    principles: ["All spending requires approval", "All external communications require approval", "Weekly executive briefings", "You control the Constitution directly"],
  },
  {
    type: "growth" as const,
    name: "Growth-Focused",
    description: "Balance speed with oversight. Routine operations run autonomously, strategic decisions come to you.",
    principles: ["Routine tasks execute automatically", "Spending above $100 requires approval", "Strategic decisions route to CEO", "Weekly progress reports"],
  },
  {
    type: "efficiency" as const,
    name: "Efficiency-First",
    description: "Maximum automation. Only exceptional decisions require intervention. Best for mature operations.",
    principles: ["Minimal approval requirements", "Cost optimization prioritized", "Automated exception handling", "Monthly executive summaries"],
  },
  {
    type: "custom" as const,
    name: "Custom",
    description: "Define your own operating principles from scratch. Full control over every aspect of governance.",
    principles: ["Define your own approval thresholds", "Customize agent permissions", "Set your own reporting cadence", "Full flexibility"],
  },
];

const defaultAgents = [
  {
    role: "Executive Agent",
    name: "Atlas",
    description: "Your chief of staff. Coordinates all agents, manages priorities, and ensures everything runs smoothly. Reports directly to you.",
    selected: true,
    required: true,
  },
  {
    role: "Research Agent",
    name: "Athena",
    description: "Gathers and analyzes information. Monitors competitors, markets, and opportunities. Provides intelligence for decision-making.",
    selected: true,
    required: false,
  },
  {
    role: "Operations Agent",
    name: "Atlas",
    description: "Manages day-to-day execution. Coordinates tasks, tracks progress, and ensures projects stay on schedule and within budget.",
    selected: true,
    required: false,
  },
  {
    role: "Marketing Agent",
    name: "Mercury",
    description: "Handles marketing communications, content creation, and campaign management. Builds your brand presence.",
    selected: false,
    required: false,
  },
  {
    role: "Engineering Agent",
    name: "Forge",
    description: "Manages technical development, code review, and deployment. Handles engineering tasks and technical infrastructure.",
    selected: false,
    required: false,
  },
  {
    role: "Finance Agent",
    name: "Ledger",
    description: "Manages budgets, tracks expenses, and provides financial reporting. Monitors spending across all departments.",
    selected: false,
    required: false,
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [organization, setOrganization] = useState({
    name: "",
    description: "",
    objective: "",
  });
  const [constitution, setConstitution] = useState<typeof constitutionTypes[0] | null>(null);
  const [agents, setAgents] = useState(defaultAgents);
  const [isSaving, setIsSaving] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load saved state from API on mount
  useEffect(() => {
    async function loadState() {
      try {
        const res = await fetch("/api/onboarding");
        if (res.ok) {
          const json = await res.json();
          const state = json.data;
          if (state?.completedAt) {
            setIsComplete(true);
            router.push("/app");
            return;
          }
          if (state?.organization) setOrganization(state.organization);
          if (state?.constitution) {
            const found = constitutionTypes.find((c) => c.type === state.constitution.type);
            setConstitution(found || null);
          }
          if (state?.agents) setAgents(state.agents);
        }
      } catch {
        // Ignore errors — start fresh
      }
    }
    loadState();
  }, [router]);

  // Save state to API on change (debounced via effect)
  useEffect(() => {
    if (isComplete) return;
    const timeout = setTimeout(async () => {
      try {
        await fetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: currentStep === 0 ? "organization" : currentStep === 1 ? "constitution" : "agents",
            data: {
              organization,
              constitution,
              agents,
            },
          }),
        });
      } catch {
        // Best-effort save — don't block the UI
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [organization, constitution, agents, currentStep, isComplete]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Hire selected agents via the real API
      const selectedAgents = agents.filter((a) => a.selected);
      const hirePromises = selectedAgents.map((a) =>
        fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: a.name,
            role: a.role,
            department: a.role.includes("Executive")
              ? "Executive"
              : a.role.includes("Research")
              ? "Research"
              : a.role.includes("Operations")
              ? "Operations"
              : a.role.includes("Marketing")
              ? "Marketing"
              : a.role.includes("Engineering")
              ? "Engineering"
              : a.role.includes("Finance")
              ? "Finance"
              : undefined,
          }),
        })
      );

      const results = await Promise.allSettled(hirePromises);
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        console.warn(`${failures.length} agent hires failed:`, failures);
      }

      // Mark onboarding as complete
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "complete",
          data: {
            organization,
            constitution,
            agents: selectedAgents,
            complete: true,
          },
        }),
      });

      setIsComplete(true);
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete onboarding");
      setIsSaving(false);
    }
  };

  const toggleAgent = (index: number) => {
    const agent = agents[index];
    if (!agent || agent.required) return;
    const newAgents = [...agents];
    newAgents[index] = { ...agent, selected: !agent.selected };
    setAgents(newAgents);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return organization.name.trim().length > 0;
      case 1:
        return constitution !== null;
      case 2:
        return agents.filter((a) => a.selected).length >= 1;
      default:
        return false;
    }
  };

  if (isComplete) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-navy-950 p-6">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-emerald" />
          <p className="mt-4 text-lg text-white">Setting up your organization...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">ORQ8</span>
            <span className="h-2 w-2 rounded-full bg-lime" />
          </div>
          <span className="text-sm text-white/50">
            Step {currentStep + 1} of {steps.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/10">
        <div
          className="h-full bg-emerald transition-all duration-300"
          style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
        />
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald">
            Step {currentStep + 1}
          </p>
          <h1 className="mt-2 text-3xl font-semibold text-white">
            {steps[currentStep]?.title}
          </h1>
          <p className="mt-2 text-white/60">{steps[currentStep]?.description}</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-900/30 border border-red-700/50 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        {/* Step 1: Organization */}
        {currentStep === 0 && (
          <div className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Organization Name *
              </label>
              <input
                type="text"
                value={organization.name}
                onChange={(e) => setOrganization({ ...organization, name: e.target.value })}
                placeholder="My AI Company"
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 outline-none transition-colors focus:border-emerald focus:bg-white/10"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Description (optional)
              </label>
              <textarea
                value={organization.description}
                onChange={(e) => setOrganization({ ...organization, description: e.target.value })}
                placeholder="What does your company do?"
                rows={3}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 outline-none transition-colors focus:border-emerald focus:bg-white/10"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Primary Objective (optional)
              </label>
              <textarea
                value={organization.objective}
                onChange={(e) => setOrganization({ ...organization, objective: e.target.value })}
                placeholder="What is the main goal for your AI organization?"
                rows={2}
                className="w-full rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-white placeholder:text-white/40 outline-none transition-colors focus:border-emerald focus:bg-white/10"
              />
            </div>
          </div>
        )}

        {/* Step 2: Constitution */}
        {currentStep === 1 && (
          <div className="space-y-4">
            {constitutionTypes.map((type) => (
              <button
                key={type.type}
                onClick={() => setConstitution(type)}
                className={`w-full rounded-xl border p-5 text-left transition-all ${
                  constitution?.type === type.type
                    ? "border-emerald bg-emerald/5"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-white">{type.name}</h3>
                    <p className="mt-1 text-sm text-white/60">{type.description}</p>
                  </div>
                  {constitution?.type === type.type && (
                    <Check className="h-5 w-5 shrink-0 text-emerald" />
                  )}
                </div>
                <ul className="mt-4 space-y-2">
                  {type.principles.map((principle) => (
                    <li key={principle} className="flex items-center gap-2 text-sm text-white/70">
                      <span className="h-1 w-1 rounded-full bg-emerald" />
                      {principle}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>
        )}

        {/* Step 3: Agents */}
        {currentStep === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-white/60">
              Select the AI employees for your organization. Required agents are pre-selected.
            </p>
            {agents.map((agent, index) => (
              <button
                key={agent.role}
                onClick={() => toggleAgent(index)}
                disabled={agent.required}
                className={`w-full rounded-xl border p-4 text-left transition-all ${
                  agent.selected
                    ? "border-emerald bg-emerald/5"
                    : "border-white/10 hover:border-white/20"
                } ${agent.required ? "opacity-75" : ""}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        agent.selected ? "bg-emerald text-navy-950" : "bg-white/10 text-white/60"
                      }`}
                    >
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white">{agent.name}</h3>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-white/50">
                          {agent.role}
                        </span>
                        {agent.required && (
                          <span className="rounded-full bg-emerald/20 px-2 py-0.5 text-[10px] text-emerald">
                            Required
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-white/60">{agent.description}</p>
                    </div>
                  </div>
                  <div
                    className={`mt-1 h-5 w-5 shrink-0 rounded border-2 ${
                      agent.selected ? "border-emerald bg-emerald" : "border-white/30"
                    }`}
                  >
                    {agent.selected && <Check className="h-4 w-4 text-navy-950" />}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-10 flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentStep === 0}
            className="flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white disabled:opacity-50 disabled:hover:text-white/60"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            disabled={!canProceed() || isSaving}
            className="flex items-center gap-2 rounded-lg bg-emerald px-6 py-3 text-sm font-semibold text-navy-950 transition-colors hover:bg-emerald/90 disabled:opacity-50 disabled:hover:bg-emerald"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : currentStep === steps.length - 1 ? (
              <>
                Enter Command Center
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
