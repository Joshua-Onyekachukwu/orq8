"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { analytics } from "@/lib/analytics";
import { levelAllowed } from "../../lib/autonomy-tiers";
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
  website?: string;
  priorities: string[];
  risks: string[];
  existingSystems?: string[];
  products?: Array<{ name: string; purpose: string; status: string }>;
  customers?: Array<{ segment: string; useCase: string }>;
  team?: Array<{ role: string; department: string }>;
  technology?: Array<{ name: string; category: string }>;
  tools?: Array<{ name: string; category: string }>;
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

type Phase = "path" | "playbook" | "describe" | "analyzing" | "analysis" | "planning" | "plan" | "activating" | "done";

type AutonomyChoice = "cautious" | "balanced" | "autonomous";

// C-09: the founder's approval preference, wired to the real enforcement
// columns — PATCH /v1/agents/:id writes the same `autonomy_level` +
// `authority.requiresApprovalFor` the execution path reads
// (services/autonomy.enforceAutonomy + tool-registry spend check), so this is
// policy, not a label.
const AUTONOMY_OPTIONS: Array<{
  key: AutonomyChoice;
  title: string;
  hint: string;
  autonomyLevel: string;
  requiresApprovalFor: string[];
}> = [
  {
    key: "cautious",
    title: "Check with me first",
    hint: "Every consequential action waits for your approval.",
    autonomyLevel: "execute_with_approval",
    requiresApprovalFor: ["financial_commitments", "external_communications", "irreversible_actions", "high_impact_decisions"],
  },
  {
    key: "balanced",
    title: "Approve the big stuff",
    hint: "Money and outside contact need you; routine work runs.",
    autonomyLevel: "execute_with_approval",
    requiresApprovalFor: ["financial_commitments", "external_communications"],
  },
  {
    key: "autonomous",
    title: "Run autonomously",
    hint: "Full execution within the constitution — approvals only for spend.",
    autonomyLevel: "autonomous",
    requiresApprovalFor: [],
  },
];

interface PlaybookMeta {
  slug: string;
  name: string;
  tagline: string;
  description: string;
}

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
  const [notice, setNotice] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [editedAnalysis, setEditedAnalysis] = useState<CompanyAnalysis | null>(null);

  // Department catalog (post-activation expansion from the system template catalog)
  const [catalogDepts, setCatalogDepts] = useState<Array<{ id: string; name: string; mission: string | null; description: string | null; teams: Array<{ name: string }> }>>([]);
  const [activatingDeptId, setActivatingDeptId] = useState<string | null>(null);
  // C-05: activated templates stay visible as confirmed successes (with an
  // "Open it" link) instead of vanishing silently from the list.
  const [activatedCatalog, setActivatedCatalog] = useState<Array<{ id: string; name: string; departmentId?: string }>>([]);
  const [stayedForCatalog, setStayedForCatalog] = useState(false);
  const redirectRef = useRef<number | null>(null);

  const scheduleRedirect = (ms: number) => {
    if (redirectRef.current) window.clearTimeout(redirectRef.current);
    redirectRef.current = window.setTimeout(() => router.push("/app"), ms);
  };

  // Load saved state so the founder can resume
  useEffect(() => {
    async function loadState() {
      try {
        // The proxy route serves state via GET /api/company-builder (no action param).
        const res = await fetch("/api/company-builder");
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
    analytics.onboardingStarted(type);
    setPhase("playbook");
  };

  // C-03/C-04: first-run demo door. The demo lives in its OWN org (a fresh
  // "Northwind Labs (Demo)" the API creates, seeds, and moves this session
  // into) — it never touches the founder's real company. A 409 demo_exists
  // means a live demo org already exists: switch back into it instead.
  const [seedingDemo, setSeedingDemo] = useState(false);
  // ?demo=1 carries "tour the demo" intent from the register-page door.
  const [demoIntent, setDemoIntent] = useState(false);
  useEffect(() => {
    try {
      setDemoIntent(new URLSearchParams(window.location.search).get("demo") === "1");
    } catch {
      // Non-browser render: no intent to carry.
    }
  }, []);
  const startDemo = async () => {
    if (seedingDemo) return;
    setSeedingDemo(true);
    setError(null);
    try {
      const res = await fetch("/api/demo-company/isolated", { method: "POST" });
      // C-10: onboarding is reachable publicly, but the demo needs a
      // session — send anonymous founders through free signup and back.
      if (res.status === 401) {
        router.push(`/register?next=${encodeURIComponent("/onboarding?demo=1")}`);
        return;
      }
      const json = await res.json().catch(() => null);
      if (res.status === 409 && json?.data?.orgId) {
        await fetch("/api/org/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ org_id: json.data.orgId }),
        });
        router.push("/app");
        return;
      }
      if (!res.ok || json?.error) throw new Error(json?.error?.message ?? "Demo setup failed");
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set up the demo company");
    } finally {
      setSeedingDemo(false);
    }
  };

  // Industry playbooks — offer a ready-made operating model before the
  // describe/analyze flow, so time-to-first-win stays under 10 minutes.
  const [playbooksList, setPlaybooksList] = useState<PlaybookMeta[]>([]);
  const [playbooksLoading, setPlaybooksLoading] = useState(false);
  const [seedingPlaybook, setSeedingPlaybook] = useState<string | null>(null);
  // C-02: a playbook is a template applied to YOUR company — the seed is gated
  // behind the company facts so generic industry content never poses as strategy.
  const [playbookCompany, setPlaybookCompany] = useState("");
  const [playbookObjective, setPlaybookObjective] = useState("");

  useEffect(() => {
    if (phase !== "playbook") return;
    setPlaybooksLoading(true);
    fetch("/api/company-builder?action=playbooks")
      .then(res => res.json())
      .then(json => {
        const list = json?.data?.playbooks;
        if (Array.isArray(list)) setPlaybooksList(list);
      })
      .catch(() => {
        // Fall back to the describe flow if playbooks are unavailable.
        setPlaybooksList([]);
      })
      .finally(() => setPlaybooksLoading(false));
  }, [phase]);

  const seedPlaybook = async (slug: string) => {
    // C-02 gate: no company facts, no seed. The API enforces this too, so a
    // direct call cannot bypass the gate either.
    if (!playbookCompany.trim()) {
      setError("Name your company first — the playbook builds on your facts, not generic ones.");
      return;
    }
    setSeedingPlaybook(slug);
    setPhase("activating");
    setError(null);
    setProgressLabel("Applying your industry operating model...");
    try {
      const res = await fetch("/api/company-builder?action=playbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          companyName: playbookCompany.trim(),
          ...(playbookObjective.trim() ? { objective: playbookObjective.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error?.message ?? "Playbook failed");
      const result = json?.data?.result;
      if (result?.activation) {
        setActivation(result.activation);
        // Playbook path skips plan review, so it ships the default posture.
        await applyAutonomy((result.activation?.agents ?? []).map((a: { id: string }) => a.id), "balanced");
        setPhase("done");
        // If the plan capped the seeded workforce below the playbook size,
        // tell the founder rather than silently shipping a smaller team.
        if (result.agentLimitApplied) {
          setNotice(
            `Your current plan allows ${result.agentLimitApplied.to} AI employees, so the ${result.agentLimitApplied.from}-employee playbook was trimmed to fit — upgrade later to unlock the full team.`,
          );
        }
        analytics.onboardingCompleted(
          result.activation.departments?.length ?? 0,
          result.activation.agents?.length ?? 0,
          result.activation.goals?.length ?? 0,
        );
        const catalogCount = await fetchCatalog();
        // No auto-redirect race: with catalog departments to consider the
        // founder stays and continues explicitly; otherwise hand over shortly.
        if (catalogCount === 0) scheduleRedirect(2200);
      } else {
        // Already seeded — straight to the dashboard.
        router.push("/app");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to seed playbook");
      setPhase("playbook");
    } finally {
      setSeedingPlaybook(null);
    }
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

  const fetchCatalog = async (): Promise<number> => {
    try {
      const res = await fetch("/api/department-templates");
      if (res.ok) {
        const json = await res.json();
        const list = (json.data ?? []) as Array<{ id: string; name: string; mission: string | null; description: string | null; teams: Array<{ name: string }> }>;
        setCatalogDepts(list);
        return list.length;
      }
    } catch {
      setCatalogDepts([]);
    }
    return 0;
  };

  const activateCatalogDept = async (templateId: string) => {
    setActivatingDeptId(templateId);
    setError(null);
    try {
      const res = await fetch(`/api/department-templates/${templateId}/activate`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error?.message ?? json?.error ?? "Activation failed");
      }
      // Stay on this screen so the founder can activate more; hand them an
      // explicit continue button instead of an auto-redirect race.
      if (redirectRef.current) window.clearTimeout(redirectRef.current);
      setStayedForCatalog(true);
      const name = catalogDepts.find((t) => t.id === templateId)?.name ?? "Department";
      const departmentId = (json as { data?: { departmentId?: string } } | null)?.data?.departmentId;
      // C-05: confirm the activation visibly (name + Open link) rather than
      // silently dropping the row — the silent drop read as "nothing happened".
      setActivatedCatalog((prev) =>
        prev.some((a) => a.id === templateId) ? prev : [...prev, { id: templateId, name, departmentId }],
      );
      setCatalogDepts((prev) => prev.filter((t) => t.id !== templateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setActivatingDeptId(null);
    }
  };

  const [autonomyChoice, setAutonomyChoice] = useState<AutonomyChoice>("balanced");
  const [autonomyApplied, setAutonomyApplied] = useState<string | null>(null);
  // P2 tier map: the plan ceiling for autonomy (from /api/entitlements).
  // Unknown/absent fails open — the API still enforces with a 403.
  const [planMaxAutonomy, setPlanMaxAutonomy] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== "plan") return;
    fetch("/api/entitlements")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const max = json?.data?.autonomy;
        if (typeof max === "string" && max) {
          setPlanMaxAutonomy(max);
          if (!levelAllowed(max, AUTONOMY_OPTIONS.find((o) => o.key === autonomyChoice)?.autonomyLevel ?? "")) {
            setAutonomyChoice("balanced");
          }
        }
      })
      .catch(() => {
        // Entitlements unavailable: leave every option selectable; the
        // activation PATCH answers 403 with the upgrade path if needed.
      });
    // Intentionally keyed on phase only: refetching on every selection
    // change would flicker the options. No eslint in this repo.
  }, [phase]);

  // C-09: apply the founder's approval preference to every hired agent.
  // Best-effort per agent — a single failure must not fail activation; the
  // founder can still tune each employee from its workspace afterwards.
  const applyAutonomy = async (agentIds: string[], choice: AutonomyChoice) => {
    const opt = AUTONOMY_OPTIONS.find((o) => o.key === choice) ?? AUTONOMY_OPTIONS[1]!;
    let ok = 0;
    for (const id of agentIds) {
      try {
        const res = await fetch(`/api/agents/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            autonomyLevel: opt.autonomyLevel,
            authority: { requiresApprovalFor: opt.requiresApprovalFor, spendingLimitCents: 0 },
          }),
        });
        if (res.ok) ok += 1;
      } catch {
        // Counted as missed below; activation still succeeds.
      }
    }
    if (ok > 0) setAutonomyApplied(opt.title);
    if (ok < agentIds.length) {
      setNotice(
        (prev) => prev ??
        `Approval preferences applied to ${ok} of ${agentIds.length} employees — tune the rest from each employee's workspace.`,
      );
    }
  };

  const activateCompany = async () => {
    if (!plan) return;
    setPhase("activating");
    setError(null);
    setProgressLabel("Hiring your AI employees...");
    try {
      // Send the founder-reviewed company name so activation applies it to the
      // org record (C-06) — otherwise the dashboard keeps the signup-time name.
      const companyName = (editedAnalysis ?? analysis)?.companyName?.trim() || undefined;
      const res = await fetch("/api/company-builder?action=activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, ...(companyName ? { companyName } : {}) }),
      });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error?.message ?? "Activation failed");
      const act = json.data.activation as ActivationResult;
      setActivation(act);
      await applyAutonomy((act?.agents ?? []).map((a) => a.id), autonomyChoice);
      setPhase("done");
      analytics.onboardingCompleted(
        act?.departments?.length ?? 0,
        act?.agents?.length ?? 0,
        act?.goals?.length ?? 0,
      );
      const catalogCount = await fetchCatalog();
      // No auto-redirect race: with catalog departments to consider the
      // founder stays and continues explicitly; otherwise hand over shortly.
      if (catalogCount === 0) scheduleRedirect(2200);
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
      <div className="flex min-h-screen items-center justify-center ink p-6">
        <Loader2 className="h-8 w-8 animate-spin text-ink-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen ink">
      {/* Header */}
      <div className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-4xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-white">ORQ8</span>
            <span className="h-2 w-2 rounded-full bg-mark-active" />
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
            <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-ink-accent">
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
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left transition-all hover:border-ink-accent/60 hover:bg-white/[0.06]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-accent/10 text-ink-accent">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">{sourceDescriptions.idea.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{sourceDescriptions.idea.subtitle}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink-accent">
                  Start with an idea <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>

              <button
                onClick={() => startPath("existing")}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left transition-all hover:border-ink-accent/60 hover:bg-white/[0.06]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-warm/10 text-warm-ink">
                  <Building2 className="h-5 w-5" />
                </div>
                <h2 className="mt-4 text-lg font-semibold text-white">{sourceDescriptions.existing.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-white/50">{sourceDescriptions.existing.subtitle}</p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-warm-ink">
                  Connect your company <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            </div>

            <button
              onClick={startDemo}
              disabled={seedingDemo}
              className={`group mt-4 flex w-full items-center gap-4 rounded-2xl border border-dashed bg-transparent p-5 text-left transition-all hover:border-ink-accent/60 hover:bg-white/[0.04] disabled:opacity-60 ${demoIntent ? "border-ink-accent/70 bg-white/[0.05]" : "border-white/20"}`}
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/5 text-white/70">
                {seedingDemo ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              </div>
              <span>
                <span className="block text-base font-semibold text-white">
                  {seedingDemo ? "Setting up your demo company…" : "Just looking? Explore a demo company"}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-white/50">
                  Tour a living sample company in its own separate space — your real company stays untouched.
                </span>
              </span>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-white/40 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}

        {/* ── PLAYBOOK — ready-made operating model ── */}
        {phase === "playbook" && (
          <div className="animate-fade-up">
            <button onClick={() => setPhase("path")} className="flex items-center gap-1.5 text-sm text-white/40 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
            <p className="mt-8 font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-ink-accent">
              Start with an operating model
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white">Choose an industry playbook</h1>
            <p className="mt-3 max-w-xl text-white/60">
              A playbook seeds your constitution, departments, AI employees, initial goals and starter tasks —
              applied to <em className="text-white/80 not-italic underline decoration-ink-accent/60 underline-offset-4">your</em> company facts below,
              so the result is yours rather than generic. You can also skip and describe
              your company from scratch.
            </p>

            {/* C-02 gate: company facts before any seed. */}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="playbook-company" className="mb-1.5 block text-xs font-medium text-white/70">
                  Company name <span className="text-ink-accent">*</span>
                </label>
                <input
                  id="playbook-company"
                  value={playbookCompany}
                  onChange={(e) => setPlaybookCompany(e.target.value)}
                  placeholder="e.g. NovaForge AI"
                  maxLength={120}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-ink-accent"
                />
              </div>
              <div>
                <label htmlFor="playbook-objective" className="mb-1.5 block text-xs font-medium text-white/70">
                  Primary objective <span className="text-white/35">(optional)</span>
                </label>
                <input
                  id="playbook-objective"
                  value={playbookObjective}
                  onChange={(e) => setPlaybookObjective(e.target.value)}
                  placeholder="e.g. Reach $1M ARR with mid-market ops teams"
                  maxLength={500}
                  className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-ink-accent"
                />
              </div>
            </div>
            {!playbookCompany.trim() && (
              <p className="mt-3 text-xs text-white/45">Name your company above to unlock the playbooks.</p>
            )}
            {error && phase === "playbook" && <ErrorBanner message={error} />}

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {playbooksLoading && playbooksList.length === 0
                ? [0, 1, 2].map((i) => (
                    <div
                      key={i}
                      aria-hidden="true"
                      className="animate-pulse rounded-2xl border border-white/10 bg-white/[0.03] p-6"
                    >
                      <div className="h-10 w-10 rounded-xl bg-white/10" />
                      <div className="mt-4 h-4 w-2/3 rounded bg-white/10" />
                      <div className="mt-2 h-3 w-1/2 rounded bg-white/[0.07]" />
                      <div className="mt-3 h-3 w-full rounded bg-white/[0.07]" />
                      <div className="mt-1 h-3 w-5/6 rounded bg-white/[0.07]" />
                    </div>
                  ))
                : playbooksList.map(p => (
                <button
                  key={p.slug}
                  onClick={() => seedPlaybook(p.slug)}
                  disabled={seedingPlaybook !== null || !playbookCompany.trim()}
                  title={!playbookCompany.trim() ? "Name your company first" : `Seed the ${p.name} playbook`}
                  className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left transition-all hover:border-ink-accent/60 hover:bg-white/[0.06] disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-accent/10 text-ink-accent">
                    {seedingPlaybook === p.slug ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Layers className="h-5 w-5" />
                    )}
                  </div>
                  <h2 className="mt-4 text-base font-semibold text-white">{p.name}</h2>
                  <p className="mt-1 text-3xs font-medium uppercase tracking-wide text-ink-accent">{p.tagline}</p>
                  <p className="mt-3 text-sm leading-relaxed text-white/50">{p.description}</p>
                </button>
              ))}
            </div>

            <div className="mt-8">
              <button
                onClick={() => setPhase("describe")}
                className="text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                Skip — describe my company instead
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
            <p className="mt-8 font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-ink-accent">
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
                placeholder={
                  sourceType === "idea"
                    ? "e.g. I'm building a SaaS platform that helps small businesses manage their finances..."
                    : "e.g. We run a digital marketing agency with 5 clients, a team of 6, and a website at..."
                }
                rows={5}
                className="w-full resize-none rounded-xl border border-white/20 bg-white/5 px-5 py-4 text-white placeholder:text-white/30 outline-none transition-colors focus:border-ink-accent focus:bg-white/10"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-white/35">
                <span>{description.trim().length} characters</span>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-ink-accent" />
                  Review before anything runs — nothing activates until you approve it
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
                    className="rounded-full border border-white/15 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition-colors hover:border-ink-accent/50 hover:text-white"
                  >
                    {s.length > 70 ? s.slice(0, 70) + "…" : s}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 flex items-center justify-between">
              <span className="text-sm text-white/40">You review the understanding before ORQ8 designs anything.</span>
              <button
                onClick={runAnalyze}
                disabled={description.trim().length < 10}
                className="flex items-center gap-2 rounded-lg bg-ink-accent px-6 py-3 text-sm font-semibold text-ink-surface transition-colors hover:bg-ink-accent/90 disabled:opacity-40"
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
              <div className="h-16 w-16 rounded-full border-2 border-white/10 border-t-ink-accent animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-ink-accent" />
            </div>
            <h2 className="mt-8 text-xl font-semibold text-white">
              {phase === "analyzing" ? "Understanding your company" : "Designing your organization"}
            </h2>
            <p className="mt-2 max-w-md text-white/50">{progressLabel}</p>
            <div className="mt-10 w-full max-w-sm space-y-3">
              {["Building company context", "Extracting structure and priorities", "Preparing your operating plan"].map((step, i) => (
                <div key={step} className="flex items-center gap-3 text-sm">
                  {i === 0 ? (
                    <Loader2 className="h-4 w-4 animate-spin text-ink-accent" />
                  ) : (
                    <Check className="h-4 w-4 text-ink-accent/40" />
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
              <Shield className="h-5 w-5 text-ink-accent" />
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-ink-accent">
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
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mark-active" />
                      <input
                        value={p}
                        onChange={(e) => {
                          const next = [...editedAnalysis.priorities];
                          next[i] = e.target.value;
                          setEditedAnalysis({ ...editedAnalysis, priorities: next });
                        }}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-ink-accent"
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
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warm" />
                      <input
                        value={r}
                        onChange={(e) => {
                          const next = [...editedAnalysis.risks];
                          next[i] = e.target.value;
                          setEditedAnalysis({ ...editedAnalysis, risks: next });
                        }}
                        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-ink-accent"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Structured entities ORQ8 extracted (existing-company discovery) */}
              {editedAnalysis.sourceType === "existing" &&
                (editedAnalysis.products?.length ||
                  editedAnalysis.customers?.length ||
                  editedAnalysis.team?.length ||
                  editedAnalysis.technology?.length ||
                  editedAnalysis.tools?.length) && (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-accent">What ORQ8 learned</p>
                    <EntityList label="Products" items={(editedAnalysis.products ?? []).map((p) => `${p.name}${p.status && p.status !== "launched" ? ` (${p.status})` : ""}`)} />
                    <EntityList label="Customers" items={(editedAnalysis.customers ?? []).map((c) => c.segment)} />
                    <EntityList label="Team" items={(editedAnalysis.team ?? []).map((t) => t.role)} />
                    <EntityList label="Technology" items={(editedAnalysis.technology ?? []).map((t) => t.name)} />
                    <EntityList label="Tools" items={(editedAnalysis.tools ?? []).map((t) => t.name)} />
                  </div>
                )}
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
                className="flex items-center gap-2 rounded-lg bg-ink-accent px-6 py-3 text-sm font-semibold text-ink-surface transition-colors hover:bg-ink-accent/90"
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
              <Layers className="h-5 w-5 text-ink-accent" />
              <p className="font-mono text-3xs font-semibold uppercase tracking-[0.2em] text-ink-accent">
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
                  <Building2 className="h-4 w-4 text-warm-ink" />
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
                  <Users className="h-4 w-4 text-ink-accent" />
                  <h2 className="text-lg font-semibold text-white">AI Employees ({plan.agents.length})</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {plan.agents.map((a) => (
                    <div key={a.role + a.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink-accent/10 text-sm font-bold text-ink-accent">
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
                              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-mark-active" />
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
                  <Target className="h-4 w-4 text-warm-ink" />
                  <h2 className="text-lg font-semibold text-white">Goals ({plan.goals.length})</h2>
                </div>
                <div className="mt-4 space-y-3">
                  {plan.goals.map((g, i) => (
                    <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold text-white">{g.title}</h3>
                        <span className={`rounded-full px-2.5 py-0.5 text-3xs uppercase ${
                          g.priority === "urgent" ? "bg-warm/20 text-warm-ink"
                          : g.priority === "high" ? "bg-ink-accent/15 text-ink-accent"
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
                  <ListChecks className="h-4 w-4 text-ink-accent" />
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

            {/* C-09: approval preference — written to the enforcement columns on activation. */}
            <section className="mt-10 rounded-2xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-ink-accent" />
                <h2 className="text-lg font-semibold text-white">How much leeway does your team get?</h2>
              </div>
              <p className="mt-1 text-sm text-white/50">
                This is enforced on every run — not a label. You can change it per employee later.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Approval preference">
                {AUTONOMY_OPTIONS.map((opt) => {
                  const selected = autonomyChoice === opt.key;
                  const locked = !levelAllowed(planMaxAutonomy, opt.autonomyLevel);
                  return (
                    <button
                      key={opt.key}
                      role="radio"
                      aria-checked={selected}
                      disabled={locked}
                      title={locked ? "Needs the Team plan or higher" : undefined}
                      onClick={() => setAutonomyChoice(opt.key)}
                      className={`rounded-xl border p-4 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                        selected
                          ? "border-ink-accent/70 bg-ink-accent/10"
                          : "border-white/10 bg-white/[0.02] hover:border-white/25"
                      }`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-white">
                        <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${selected ? "border-ink-accent" : "border-white/30"}`}>
                          {selected && <span className="h-2 w-2 rounded-full bg-ink-accent" />}
                        </span>
                        {opt.title}
                      </span>
                      <span className="mt-1.5 block text-xs leading-relaxed text-white/50">
                        {locked ? "Needs the Team plan or higher — upgrade to unlock." : opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <div className="mt-10 flex items-center justify-between border-t border-white/10 pt-6">
              <button
                onClick={() => setPhase("analysis")}
                className="flex items-center gap-2 text-sm text-white/50 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" /> Back to understanding
              </button>
              <button
                onClick={activateCompany}
                className="flex items-center gap-2 rounded-xl bg-ink-accent px-8 py-3.5 text-sm font-semibold text-ink-surface transition-all hover:bg-ink-accent/90 hover:shadow-lg hover:shadow-ink-accent/20"
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
              <div className="h-16 w-16 rounded-full border-2 border-white/10 border-t-ink-accent animate-spin" />
              <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-ink-accent" />
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
                    <Loader2 className="h-4 w-4 animate-spin text-ink-accent" />
                  ) : (
                    <Check className="h-4 w-4 text-ink-accent/40" />
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
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-ink-accent/15">
              <Check className="h-10 w-10 text-ink-accent" />
            </div>
            <h1 className="mt-6 text-3xl font-semibold text-white">Your company is operational</h1>
            <p className="mt-3 max-w-md text-white/60">
              ORQ8 has built your AI workforce and is preparing your command center.
            </p>
            {autonomyApplied && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3.5 py-1.5 text-xs text-white/70">
                <Shield className="h-3.5 w-3.5 text-ink-accent" />
                Your team starts in “{autonomyApplied}” mode
              </p>
            )}
            {notice && (
              <div className="mt-5 max-w-md rounded-xl border border-ink-accent/40 bg-ink-accent/10 px-4 py-3 text-sm text-ink-accent">
                {notice}
              </div>
            )}
            <div className="mt-10 grid w-full max-w-lg grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Departments" value={activation.departments.length} />
              <Stat label="AI Employees" value={activation.agents.length} />
              <Stat label="Goals" value={activation.goals.length} />
              <Stat label="Tasks" value={activation.tasks.length} />
            </div>
            {catalogDepts.length > 0 ? (
              <>
                <button
                  onClick={() => router.push("/app")}
                  className="mt-10 rounded-xl bg-ink-accent px-8 py-3.5 text-sm font-semibold text-ink-surface transition-all hover:bg-ink-accent/90"
                >
                  {stayedForCatalog ? "Done adding departments — go to dashboard →" : "Go to dashboard →"}
                </button>
                <p className="mt-2 text-sm text-white/40">Take your time — nothing here expires.</p>
              </>
            ) : (
              <>
                <Loader2 className="mt-10 h-5 w-5 animate-spin text-ink-accent" />
                <p className="mt-2 text-sm text-white/40">Taking you to your dashboard...</p>
              </>
            )}
            {(catalogDepts.length > 0 || activatedCatalog.length > 0) && (
              <div className="mt-8 w-full max-w-lg text-left">
                <p className="text-sm font-medium text-white/70">Add another department from the catalog</p>
                {activatedCatalog.length > 0 && (
                  <div className="mt-3 space-y-2" aria-live="polite">
                    {activatedCatalog.map((a) => (
                      <p key={a.id} className="rounded-xl border border-ink-accent/40 bg-ink-accent/10 px-4 py-3 text-sm text-white">
                        <span className="font-semibold">{a.name}</span> is established.
                        {a.departmentId ? (
                          <>
                            {" "}
                            <button
                              onClick={() => router.push(`/app/departments/${a.departmentId}`)}
                              className="underline underline-offset-4 hover:text-ink-accent"
                            >
                              Open it
                            </button>
                          </>
                        ) : null}
                      </p>
                    ))}
                  </div>
                )}
                <div className="mt-3 space-y-2">
                  {catalogDepts.map((t) => (
                    <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{t.name}</p>
                        <p className="text-3xs text-white/40">
                          {Array.isArray(t.teams) && t.teams.length > 0 ? `${t.teams.length} team${t.teams.length === 1 ? "" : "s"} included` : "Ready to activate"}
                        </p>
                      </div>
                      <button
                        onClick={() => activateCatalogDept(t.id)}
                        disabled={activatingDeptId !== null}
                        className="shrink-0 rounded-lg border border-ink-accent/40 px-3 py-1.5 text-xs font-semibold text-ink-accent transition-colors hover:bg-ink-accent/10 disabled:opacity-50"
                      >
                        {activatingDeptId === t.id ? "Activating…" : "Activate"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
    "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-ink-accent";
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
    <div className="mt-6 rounded-lg border border-border-error/50 bg-error-fill/30 px-4 py-3 text-sm text-error-ink">
      {message}
    </div>
  );
}

function EntityList({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-2 last:mb-0">
      <p className="mb-1 text-overline font-semibold uppercase tracking-wider text-white/40">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-white/80">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}