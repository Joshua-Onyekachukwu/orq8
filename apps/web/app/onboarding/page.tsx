"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Lightbulb,
  Building2,
  Users,
  Target,
  ListChecks,
  Sparkles,
  Shield,
  Layers,
} from "lucide-react";

type SourceType = "idea" | "existing";

interface CompanyAnalysis {
  companyName: string;
  description: string;
  industry: string;
  targetMarket: string;
  problem: string;
  solution: string;
  businessModel: string;
  stage: string;
  priorities: string[];
  risks: string[];
  existingSystems?: string[];
  sourceType: SourceType;
  rawInput: string;
}

interface ProposedAgent {
  name: string;
  role: string;
  department: string;
  responsibilities: string[];
  capabilities: string[];
  tools: string[];
}

interface CompanyPlan {
  rationale: string;
  departments: { name: string; description: string }[];
  agents: ProposedAgent[];
  goals: { title: string; description: string; priority: string }[];
  tasks: { title: string; description: string; goalIndex: number; agentRole: string; priority: string }[];
}

interface ActivationResult {
  departments: { id: string; name: string }[];
  agents: { id: string; name: string; role: string }[];
  goals: { id: string; title: string }[];
  tasks: { id: string; title: string }[];
  memoryCount: number;
}

type Phase = "path" | "describe" | "analyzing" | "analysis" | "planning" | "plan" | "activating" | "done";

const suggestionPrompts: Record<SourceType, string[]> = {
  idea: [
    "I'm building a SaaS platform that helps small businesses manage their finances",
    "I have an idea for a productivity app that helps remote teams stay focused",
    "I want to build an e-commerce marketplace for handmade goods",
    "I'm creating an AI tool that helps freelancers write proposals faster",
  ],
  existing: [
    "We run a digital marketing agency with 5 clients and a team of contractors",
    "I have a Shopify store selling eco-friendly home products, around $10k/month revenue",
    "We built a mobile app for restaurant reservations and just hit 10,000 users",
    "I run a consulting business with a small team, a website, and a CRM",
  ],
};

const sourceDescriptions: Record<SourceType, { title: string; subtitle: string }> = {
  idea: {
    title: "Start from an idea",
    subtitle: "You have a concept, a problem you want to solve, or an early vision. ORQ8 will help you structure it into a company.",
  },
  existing: {
    title: "You have an existing company",
    subtitle: "You already operate a business. ORQ8 will understand what you have and build your AI workforce around it.",
  },
};

export default function OnboardingPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("path");
  const [sourceType, setSourceType] = useState<SourceType | null>(null);
  const [description, setDescription] = useState("");
  const [analysis, setAnalysis] = useState<CompanyAnalysis | null>(null);
  const [plan, setPlan] = useState<CompanyPlan | null>(null);
  const [activation, setActivation] = useState<ActivationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [editedAnalysis, setEditedAnalysis] = useState<CompanyAnalysis | null>(null);
  const typingRef = useRef<number | null>(null);

  // Load saved state so the founder can resume
  useEffect(() => {
    async function loadState() {
      try {
        const res = await fetch("/api/company-builder/state");
        if (res.ok) {
          const json = await res.json();
          const state = json?.data;
          if (state?.completedAt || state?.activation) {
            router.push("/app");
            return;
          }
          if (state?.analysis) {
            setAnalysis(state.analysis);
            setEditedAnalysis(state.analysis);
            setSourceType(state.analysis.sourceType ?? "idea");
            setPhase(state.plan ? "plan" : "analysis");
            if (state.plan) setPlan(state.plan);
          }
        }
      } catch {
        // Start fresh
      } finally {
        setIsLoadingState(false);
      }
    }
    loadState();
  }, [router]);

  const startPath = (type: SourceType) => {
    setSourceType(type);
    setPhase("describe");
  };

  const runAnalyze = useCallback(async () => {
    if (!description.trim() || description.trim().length < 10 || !sourceType) return;
    setPhase("analyzing");
    setError(null);
    setProgressLabel("Understanding your company...");
    try {
      const res = await fetch("/api/company-builder?action=analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: description.trim(), sourceType }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error?.message ?? "Analysis failed");
      const a = json.data.analysis as CompanyAnalysis;
      setAnalysis(a);
      setEditedAnalysis(a);
      setPhase("analysis");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to analyze your company");
      setPhase("describe");
    }
  }, [description, sourceType]);

  // Debounced auto-analyze while typing (min length)
  useEffect(() => {
    if (phase !== "describe" || !sourceType) return;
    if (description.trim().length < 10) return;
    if (typingRef.current) window.clearTimeout(typingRef.current);
    typingRef.current = window.setTimeout(() => {
      runAnalyze();
    }, 1400);
    return () => {
      if (typingRef.current) window.clearTimeout(typingRef.current);
    };
  }, [description, phase, sourceType, runAnalyze]);

  const generatePlan = async () => {
    if (!analysis) return;
    setPhase("planning");
    setError(null);
    setProgressLabel("Designing your organization...");
    try {
      const res = await fetch("/api/company-builder?action=plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: editedAnalysis ?? analysis }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error?.message ?? "Plan generation failed");
      setPlan(json.data.plan as CompanyPlan);
      setPhase("plan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate your plan");
      setPhase("analysis");
    }
  };

  const activateCompany = async () => {
    if (!plan) return;
    setPhase("activating");
    setError(null);
    setProgressLabel("Hiring your AI employees...");
    try {
      const res = await fetch("/api/company-builder?action=activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error?.message ?? "Activation failed");
      setActivation(json.data.activation as ActivationResult);
      setPhase("done");
      setTimeout(() => router.push("/app"), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to activate your company");
      setPhase("plan");
    }
  };

  const updateAnalysisField = (key: keyof CompanyAnalysis, value: string) => {
    if (!editedAnalysis) return;
    setEditedAnalysis({ ...editedAnalysis, [key]: value });
  };

  // ── Loading state ──
  if (isLoadingState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-orq8-dark p-6">
        <Loader2 className="h-8 w-8 animate-spin text-orq8-lime" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-orq8-dark">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">ORQ8</span>
            <span className="h-2 w-2 rounded-full bg-orq8-lime" />
          </div>
          <span className="font-mono text-3xs uppercase tracking-[0.2em] text-white/40">
            Company Builder
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-12">
        {/* ── PATH SELECTION ── */}
        {phase === "path" && (
          <div className="animate-fade-up">
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
              Welcome to ORQ8
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">How are you starting?</h1>
            <p className="mt-3 max-w-xl text-white/60">
              Tell us what you're building — ORQ8 will understand it, structure it, and build your
              AI workforce to operate it.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <button
                onClick={() => startPath("idea")}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left transition-all hover:border-orq8-lime/60 hover:bg-white/[0.06]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orq8-lime/10 text-orq8-lime">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">{sourceDescriptions.idea.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{sourceDescriptions.idea.subtitle}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-orq8-lime">
                  Start with an idea <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>

              <button
                onClick={() => startPath("existing")}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left transition-all hover:border-orq8-lime/60 hover:bg-white/[0.06]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orq8-orange/10 text-orq8-orange">
                  <Building2 className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">{sourceDescriptions.existing.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{sourceDescriptions.existing.subtitle}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-orq8-orange">
                  Connect your company <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── DESCRIBE ── */}
        {phase === "describe" && sourceType && (
          <div className="animate-fade-up">
            <button onClick={() => setPhase("path")} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <p className="mt-8 font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
              {sourceType === "idea" ? "Starting from an idea" : "Existing company"}
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">
              {sourceType === "idea" ? "Tell ORQ8 about your idea" : "Tell ORQ8 about your company"}
            </h1>
            <p className="mt-3 text-white/60">
              {sourceType === "idea"
                ? "Describe your idea naturally — the problem, the customer, and what you want to build. ORQ8 will begin structuring it immediately."
                : "Describe your existing company — what you do, your market, your team, and your current situation. ORQ8 will analyze it and propose how to build your AI workforce around it."}
            </p>

            <div className="mt-8">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={() => {
                  if (description.trim().length >= 10) runAnalyze();
                }}
                placeholder={
                  sourceType === "idea"
                    ? "e.g. I'm building a SaaS platform that helps small businesses manage their finances..."
                    : "e.g. We run a digital marketing agency with 5 clients, a team of 6, and a website at..."
                }
                rows={5}
                className="w-full resize-none rounded-xl border border-white/20 bg-white/5 px-5 py-4 text-white placeholder:text-white/30 outline-none transition-colors focus:border-orq8-lime focus:bg-white/10"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-white/35">
                <span>{description.trim().length} characters</span>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-orq8-lime" />
                  ORQ8 analyzes as you describe — no forms needed
                </span>
              </div>
            </div>

            {/* Suggestions */}
            <div className="mt-6">
              <p className="text-xs font-medium uppercase tracking-wider text-white/40">Not sure where to start? Try:</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {suggestionPrompts[sourceType].map((s) => (
                  <button
                    key={s}
                    onClick={() => setDescription(s)}
                    className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition-colors hover:border-orq8-lime/50 hover:text-white"
                  >
                    {s.length > 70 ? s.slice(0, 70) + "…" : s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <span className="text-sm text-white/40">ORQ8 continues automatically after you describe your company.</span>
              <button
                onClick={runAnalyze}
                disabled={description.trim().length < 10}
                className="flex items-center gap-2 rounded-lg bg-orq8-lime px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-orq8-lime/90 disabled:opacity-40"
              >
                Analyze my company <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── ANALYZING ── */}
        {(phase === "analyzing" || phase === "planning") && (
          <div className="animate-fade-in flex flex-col items-center py-24 text-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-2 border-white/10 border-t-orq8-lime animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-orq8-lime" />
            </div>
            <h2 className="mt-8 text-xl font-semibold text-white">
              {phase === "analyzing" ? "Understanding your company" : "Designing your organization"}
            </h2>
            <p className="mt-2 max-w-md text-white/50">{progressLabel}</p>
            <div className="mt-10 w-full max-w-sm space-y-3">
              {["Building company context", "Extracting structure and priorities", "Preparing your operating plan"].map((step, i) => (
                <div key={step} className="flex items-center gap-3 text-sm">
                  {i === 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin text-orq8-lime" />
                  ) : (
                    <Check className="h-4 w-4 text-orq8-lime/40" />
                  )}
                  <span className={i === 0 ? "text-white/80" : "text-white/40"}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ANALYSIS REVIEW ── */}
        {phase === "analysis" && editedAnalysis && (
          <div className="animate-fade-up">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-orq8-lime" />
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
                ORQ8's understanding
              </p>
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">Here's what ORQ8 learned</h1>
            <p className="mt-2 text-white/60">
              Review and correct anything that's wrong. This becomes your Company Brain — the foundation of your AI workforce.
            </p>

            <div className="mt-8 space-y-6">
              <Field label="Company name" value={editedAnalysis.companyName} onChange={(v) => updateAnalysisField("companyName", v)} placeholder="Your company or product name" />
              <Field label="Description" value={editedAnalysis.description} onChange={(v) => updateAnalysisField("description", v)} textarea placeholder="What your company does" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Industry" value={editedAnalysis.industry} onChange={(v) => updateAnalysisField("industry", v)} placeholder="e.g. Fintech" />
                <Field label="Target market" value={editedAnalysis.targetMarket} onChange={(v) => updateAnalysisField("targetMarket", v)} placeholder="Who your customers are" />
              </div>
              <Field label="Problem" value={editedAnalysis.problem} onChange={(v) => updateAnalysisField("problem", v)} textarea placeholder="The problem you solve" />
              <Field label="Solution" value={editedAnalysis.solution} onChange={(v) => updateAnalysisField("solution", v)} textarea placeholder="How you solve it" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Business model" value={editedAnalysis.businessModel} onChange={(v) => updateAnalysisField("businessModel", v)} placeholder="How you make money" />
                <Field label="Stage" value={editedAnalysis.stage} onChange={(v) => updateAnalysisField("stage", v)} placeholder="idea / launched / growing" />
              </div>

              {/* Priorities */}
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Priorities</label>
                <div className="space-y-2">
                  {editedAnalysis.priorities.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orq8-lime" />
                      <input
                        value={p}
                        onChange={(e) => {
                          const next = [...editedAnalysis.priorities];
                          next[i] = e.target.value;
                          setEditedAnalysis({ ...editedAnalysis, priorities: next });
                        }}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-orq8-lime"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Risks */}
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">Risks & unknowns</label>
                <div className="space-y-2">
                  {editedAnalysis.risks.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orq8-orange" />
                      <input
                        value={r}
                        onChange={(e) => {
                          const next = [...editedAnalysis.risks];
                          next[i] = e.target.value;
                          setEditedAnalysis({ ...editedAnalysis, risks: next });
                        }}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-orq8-lime"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            <div className="mt-10 flex items-center justify-between">
              <button
                onClick={() => setPhase("describe")}
                className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" /> Redo description
              </button>
              <p className="hidden text-xs text-white/35 sm:block">Your corrections are included in the plan.</p>
              <button
                onClick={generatePlan}
                className="flex items-center gap-2 rounded-lg bg-orq8-lime px-6 py-3 text-sm font-semibold text-ink transition-colors hover:bg-orq8-lime/90"
              >
                Design my organization <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* ── PLAN REVIEW ── */}
        {phase === "plan" && plan && (
          <div className="animate-fade-up">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-orq8-lime" />
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-orq8-lime">
                Your Operating Plan
              </p>
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white">Your ORQ8 company is ready to form</h1>
            <p className="mt-3 max-w-2xl text-white/60">{plan.rationale}</p>

            {error && <ErrorBanner message={error} />}

            <div className="mt-10 space-y-10">
              {/* Departments */}
              <section>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-orq8-orange" />
                  <h2 className="text-lg font-semibold text-white">Departments ({plan.departments.length})</h2>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {plan.departments.map((d) => (
                    <div key={d.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <h3 className="font-semibold text-white">{d.name}</h3>
                      <p className="mt-1 text-sm text-white/50">{d.description}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* AI Employees */}
              <section>
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-orq8-lime" />
                  <h2 className="text-lg font-semibold text-white">AI Employees ({plan.agents.length})</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {plan.agents.map((a) => (
                    <div key={a.role + a.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orq8-lime/10 text-sm font-bold text-orq8-lime">
                          {a.name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-white">{a.name}</h3>
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-3xs uppercase tracking-wide text-white/50">{a.role}</span>
                          </div>
                          <p className="text-sm text-white/40">Department: {a.department}</p>
                        </div>
                      </div>
                      {a.responsibilities.length > 0 && (
                        <ul className="mt-3 space-y-1.5">
                          {a.responsibilities.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-white/60">
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-orq8-lime" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      )}
                      {a.capabilities.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {a.capabilities.map((c, i) => (
                            <span key={i} className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-3xs text-white/50">{c}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              {/* Goals */}
              <section>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-orq8-orange" />
                  <h2 className="text-lg font-semibold text-white">Goals ({plan.goals.length})</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {plan.goals.map((g, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-white">{g.title}</h3>
                        <span className={`rounded-full px-2.5 py-0.5 text-3xs uppercase ${
                          g.priority === "urgent" ? "bg-orq8-orange/20 text-orq8-orange"
                          : g.priority === "high" ? "bg-orq8-lime/15 text-orq8-lime"
                          : "bg-white/10 text-white/50"
                        }`}>
                          {g.priority}
                        </span>
                      </div>
                      {g.description && <p className="mt-1 text-sm text-white/50">{g.description}</p>}
                    </div>
                  ))}
                </div>
              </section>

              {/* Tasks */}
              <section>
                <div className="flex items-center gap-2">
                  <ListChecks className="h-4 w-4 text-orq8-lime" />
                  <h2 className="text-lg font-semibold text-white">Initial tasks ({plan.tasks.length})</h2>
                </div>
                <div className="mt-4 space-y-2">
                  {plan.tasks.map((t, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-3xs text-white/60">{i + 1}</span>
                      <div>
                        <p className="text-sm font-medium text-white">{t.title}</p>
                        <p className="mt-0.5 text-3xs text-white/40">
                          {t.agentRole} · {plan.goals[t.goalIndex]?.title ?? "Company goal"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-6">
              <button
                onClick={() => setPhase("analysis")}
                className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" /> Back to understanding
              </button>
              <button
                onClick={activateCompany}
                className="flex items-center gap-2 rounded-xl bg-orq8-lime px-8 py-3.5 text-sm font-semibold text-ink transition-all hover:bg-orq8-lime/90 hover:shadow-lg hover:shadow-orq8-lime/20"
              >
                <Sparkles className="h-4 w-4" />
                Activate my company
              </button>
            </div>
          </div>
        )}

        {/* ── ACTIVATING ── */}
        {phase === "activating" && (
          <div className="animate-fade-in flex flex-col items-center py-24 text-center">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-2 border-white/10 border-t-orq8-lime animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-orq8-lime" />
            </div>
            <h2 className="mt-8 text-xl font-semibold text-white">Building your company</h2>
            <p className="mt-2 text-white/50">{progressLabel}</p>
            <div className="mt-10 w-full max-w-sm space-y-3 text-left">
              {[
                "Creating departments",
                "Hiring AI employees",
                "Setting goals and tasks",
                "Seeding your Company Brain",
              ].map((step, i) => (
                <div key={step} className="flex items-center gap-3 text-sm">
                  {i < 2 ? (
                    <Loader2 className="h-4 w-4 animate-spin text-orq8-lime" />
                  ) : (
                    <Check className="h-4 w-4 text-orq8-lime/40" />
                  )}
                  <span className={i < 2 ? "text-white/80" : "text-white/40"}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DONE ── */}
        {phase === "done" && activation && (
          <div className="animate-fade-up flex flex-col items-center py-24 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orq8-lime/15">
              <Check className="h-10 w-10 text-orq8-lime" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold text-white">Your company is operational</h1>
            <p className="mt-3 max-w-md text-white/60">
              ORQ8 has built your AI workforce and is preparing your command center.
            </p>
            <div className="mt-10 grid w-full max-w-lg grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Departments" value={activation.departments.length} />
              <Stat label="AI Employees" value={activation.agents.length} />
              <Stat label="Goals" value={activation.goals.length} />
              <Stat label="Tasks" value={activation.tasks.length} />
            </div>
            <Loader2 className="mt-10 h-5 w-5 animate-spin text-orq8-lime" />
            <p className="mt-2 text-sm text-white/40">Taking you to your dashboard...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Small presentational components ────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  const cls =
    "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-orq8-lime";
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-white/80">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className={`${cls} resize-none`} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-3xs uppercase tracking-wide text-white/40">{label}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-6 rounded-lg border border-red-700/50 bg-red-900/30 px-4 py-3 text-sm text-red-200">
      {message}
    </div>
  );
}