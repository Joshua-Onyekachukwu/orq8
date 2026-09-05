"use client";

import { useEffect, useState } from "react";

/*
 * The org tree: ORQ8's signature element.
 * One sovereign node at the top; an organization assembles below it.
 *
 * Two variants:
 *  - "hero": static, forms once on load (staggered fade, lines follow)
 *  - "full": the growth diagram, cycles α (3) → β (7) → γ (12) agents,
 *    dimming nodes that don't exist yet. State chips let the reader step.
 *
 * Two tones:
 *  - "dark": rendered on the navy hero (parchment + brass on deep navy)
 *  - "light": rendered on the ivory sections (navy ink + brass on cream)
 * Colors follow the CSS tokens, so the accent shift amber→brass flows through.
 */

type Kind = "ceo" | "exec" | "dept" | "staff";

type NodeDef = {
  id: string;
  x: number;
  y: number;
  state: number; // appears in state >= this
  kind: Kind;
  label?: string;
  num?: string;
};

type EdgeDef = { from: string; to: string; midY: number };

const HERO: { nodes: NodeDef[]; edges: EdgeDef[] } = {
  nodes: [
    { id: "ceo", x: 280, y: 44, state: 1, kind: "ceo", label: "YOU · CEO", num: "001" },
    { id: "exec", x: 280, y: 132, state: 1, kind: "exec", label: "EXECUTIVE AGENT", num: "002" },
    { id: "eng", x: 104, y: 222, state: 1, kind: "dept", label: "ENG", num: "003" },
    { id: "mktg", x: 280, y: 222, state: 2, kind: "dept", label: "MKTG", num: "004" },
    { id: "rnd", x: 456, y: 222, state: 2, kind: "dept", label: "R&D", num: "005" },
    { id: "s1", x: 64, y: 312, state: 3, kind: "staff", num: "006" },
    { id: "s2", x: 104, y: 312, state: 3, kind: "staff", num: "007" },
    { id: "s3", x: 144, y: 312, state: 3, kind: "staff", num: "008" },
    { id: "s4", x: 250, y: 312, state: 3, kind: "staff", num: "009" },
    { id: "s5", x: 310, y: 312, state: 3, kind: "staff", num: "010" },
    { id: "s6", x: 416, y: 312, state: 3, kind: "staff", num: "011" },
    { id: "s7", x: 476, y: 312, state: 3, kind: "staff", num: "012" },
  ],
  edges: [
    { from: "ceo", to: "exec", midY: 88 },
    { from: "exec", to: "eng", midY: 177 },
    { from: "exec", to: "mktg", midY: 177 },
    { from: "exec", to: "rnd", midY: 177 },
    { from: "eng", to: "s1", midY: 267 },
    { from: "eng", to: "s2", midY: 267 },
    { from: "eng", to: "s3", midY: 267 },
    { from: "mktg", to: "s4", midY: 267 },
    { from: "mktg", to: "s5", midY: 267 },
    { from: "rnd", to: "s6", midY: 267 },
    { from: "rnd", to: "s7", midY: 267 },
  ],
};

const FULL: { nodes: NodeDef[]; edges: EdgeDef[] } = {
  nodes: [
    { id: "ceo", x: 360, y: 48, state: 1, kind: "ceo", label: "YOU · CEO", num: "001" },
    { id: "exec", x: 360, y: 152, state: 1, kind: "exec", label: "EXECUTIVE AGENT", num: "002" },
    { id: "eng", x: 150, y: 252, state: 1, kind: "dept", label: "ENGINEERING", num: "003" },
    { id: "mktg", x: 360, y: 252, state: 2, kind: "dept", label: "MARKETING", num: "004" },
    { id: "rnd", x: 570, y: 252, state: 2, kind: "dept", label: "RESEARCH", num: "005" },
    { id: "s1", x: 90, y: 352, state: 3, kind: "staff", num: "006" },
    { id: "s2", x: 150, y: 352, state: 3, kind: "staff", num: "007" },
    { id: "s3", x: 210, y: 352, state: 3, kind: "staff", num: "008" },
    { id: "s4", x: 300, y: 352, state: 2, kind: "staff", num: "009" },
    { id: "s5", x: 420, y: 352, state: 3, kind: "staff", num: "010" },
    { id: "s6", x: 510, y: 352, state: 2, kind: "staff", num: "011" },
    { id: "s7", x: 630, y: 352, state: 3, kind: "staff", num: "012" },
  ],
  edges: [
    { from: "ceo", to: "exec", midY: 100 },
    { from: "exec", to: "eng", midY: 202 },
    { from: "exec", to: "mktg", midY: 202 },
    { from: "exec", to: "rnd", midY: 202 },
    { from: "eng", to: "s1", midY: 302 },
    { from: "eng", to: "s2", midY: 302 },
    { from: "eng", to: "s3", midY: 302 },
    { from: "mktg", to: "s4", midY: 302 },
    { from: "mktg", to: "s5", midY: 302 },
    { from: "rnd", to: "s6", midY: 302 },
    { from: "rnd", to: "s7", midY: 302 },
  ],
};

const MONO = "var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

type ToneColors = {
  line: string;
  lineOpacity: number;
  ceoRing: string;
  ceoGlow: string;
  ceoFill: string;
  ceoDot: string;
  ceoLabel: string;
  execFill: string;
  execStroke: string;
  execDot: string;
  execLabel: string;
  deptFill: string;
  deptStroke: string;
  deptLabel: string;
  staffFill: string;
  staffStroke: string;
  num: string;
};

const TONES: Record<"dark" | "light", ToneColors> = {
  dark: {
    line: "var(--color-white)",
    lineOpacity: 0.16,
    ceoRing: "var(--color-emerald)",
    ceoGlow: "var(--color-emerald)",
    ceoFill: "var(--color-emerald)",
    ceoDot: "var(--color-navy-950)",
    ceoLabel: "var(--color-parchment)",
    execFill: "var(--color-navy-surface)",
    execStroke: "var(--color-parchment)",
    execDot: "var(--color-emerald)",
    execLabel: "var(--color-parchment)",
    deptFill: "var(--color-navy-surface)",
    deptStroke: "var(--color-parchment)",
    deptLabel: "var(--color-parchment)",
    staffFill: "var(--color-emerald)",
    staffStroke: "var(--color-emerald)",
    num: "var(--color-fog)",
  },
  light: {
    line: "var(--color-navy-900)",
    lineOpacity: 0.18,
    ceoRing: "var(--color-emerald)",
    ceoGlow: "var(--color-emerald)",
    ceoFill: "var(--color-emerald)",
    ceoDot: "var(--color-white)",
    ceoLabel: "var(--color-navy-900)",
    execFill: "var(--color-white)",
    execStroke: "var(--color-navy-900)",
    execDot: "var(--color-navy-900)",
    execLabel: "var(--color-navy-900)",
    deptFill: "var(--color-white)",
    deptStroke: "var(--color-navy-900)",
    deptLabel: "var(--color-navy-900)",
    staffFill: "var(--color-navy-900)",
    staffStroke: "var(--color-navy-900)",
    num: "var(--color-muted)",
  },
};

function NodeShape({ node, tone }: { node: NodeDef; tone: "dark" | "light" }) {
  const c = TONES[tone];
  if (node.kind === "ceo") {
    return (
      <>
        <circle className="tree-glow" cx={node.x} cy={node.y} r={30} fill="none" stroke={c.ceoGlow} strokeOpacity={0.16} />
        <circle cx={node.x} cy={node.y} r={23} fill="none" stroke={c.ceoRing} strokeOpacity={0.4} strokeWidth={1} />
        <circle cx={node.x} cy={node.y} r={15} fill={c.ceoFill} />
        <circle cx={node.x} cy={node.y} r={4.5} fill={c.ceoDot} />
        <text x={node.x} y={node.y + 38} textAnchor="middle" fill={c.ceoLabel} fontSize={10.5} letterSpacing={2.5} fontFamily={MONO}>
          {node.label}
        </text>
        <text x={node.x} y={node.y + 52} textAnchor="middle" fill={c.num} fontSize={8} letterSpacing={1.5} fontFamily={MONO}>
          NODE {node.num}
        </text>
      </>
    );
  }
  if (node.kind === "exec") {
    return (
      <>
        <circle cx={node.x} cy={node.y} r={12} fill={c.execFill} stroke={c.execStroke} strokeOpacity={0.4} strokeWidth={1} />
        <circle cx={node.x} cy={node.y} r={3} fill={c.execDot} fillOpacity={0.6} />
        <text x={node.x} y={node.y + 32} textAnchor="middle" fill={c.execLabel} fillOpacity={0.85} fontSize={9.5} letterSpacing={2} fontFamily={MONO}>
          {node.label}
        </text>
        <text x={node.x} y={node.y + 44} textAnchor="middle" fill={c.num} fontSize={8} letterSpacing={1.5} fontFamily={MONO}>
          NODE {node.num}
        </text>
      </>
    );
  }
  if (node.kind === "dept") {
    return (
      <>
        <rect x={node.x - 62} y={node.y - 13} width={124} height={26} rx={13} fill={c.deptFill} stroke={c.deptStroke} strokeOpacity={0.18} strokeWidth={1} />
        <text x={node.x} y={node.y + 3.5} textAnchor="middle" fill={c.deptLabel} fillOpacity={0.9} fontSize={9.5} letterSpacing={2.5} fontFamily={MONO}>
          {node.label}
        </text>
        <text x={node.x} y={node.y + 26} textAnchor="middle" fill={c.num} fontSize={8} letterSpacing={1.5} fontFamily={MONO}>
          NODE {node.num}
        </text>
      </>
    );
  }
  return (
    <>
      <circle cx={node.x} cy={node.y} r={6} fill={c.staffFill} fillOpacity={0.16} stroke={c.staffStroke} strokeOpacity={0.3} strokeWidth={1} />
      <text x={node.x} y={node.y + 18} textAnchor="middle" fill={c.num} fontSize={8} letterSpacing={1.5} fontFamily={MONO}>
        {node.num}
      </text>
    </>
  );
}

function OrgTree({
  variant,
  tone = "dark",
  animated,
  visibleState,
}: {
  variant: "hero" | "full";
  tone?: "dark" | "light";
  animated?: boolean;
  visibleState?: number;
}) {
  const { nodes, edges } = variant === "hero" ? HERO : FULL;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(edges.map((e) => [e.to, e]));
  const delayMs = 120;
  const c = TONES[tone];

  return (
    <svg
      viewBox={variant === "hero" ? "0 0 560 380" : "0 0 720 470"}
      className="h-auto w-full"
      role="img"
      aria-label="Organization chart: you as CEO, an executive agent below you, then departments of specialists: engineering, marketing, and research."
    >
      {nodes.map((node, i) => {
        const edge = incoming.get(node.id);
        const parent = edge ? byId.get(edge.from) : undefined;
        const groupStyle: React.CSSProperties = {};
        if (visibleState !== undefined) {
          groupStyle.opacity = node.state > visibleState ? 0.07 : 1;
          groupStyle.transition = "opacity 0.6s ease";
        }
        if (animated) {
          groupStyle.animationDelay = `${(i + 1) * delayMs}ms`;
        }
        return (
          <g
            key={node.id}
            style={groupStyle}
            className={animated ? (edge ? "tree-edge" : "tree-node") : undefined}
          >
            {edge && parent && (
              <path
                d={`M ${parent.x} ${parent.y} V ${edge.midY} H ${node.x} V ${node.y - (node.kind === "dept" ? 13 : node.kind === "staff" ? 6 : node.kind === "exec" ? 12 : 15)}`}
                fill="none"
                stroke={c.line}
                strokeOpacity={c.lineOpacity}
                strokeWidth={1}
              />
            )}
            <NodeShape node={node} tone={tone} />
          </g>
        );
      })}
    </svg>
  );
}

export function HeroTree() {
  return <OrgTree variant="hero" tone="dark" animated />;
}

const STATES = [
  { k: 1, label: "α · 3 agents" },
  { k: 2, label: "β · 7 agents" },
  { k: 3, label: "γ · 12 agents" },
];

export function GrowthTree({ tone = "light" }: { tone?: "dark" | "light" }) {
  const [state, setState] = useState(1);

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState(3);
      return;
    }
    const t = setInterval(() => setState((s) => (s === 3 ? 1 : s + 1)), 3600);
    return () => clearInterval(t);
  }, []);

  const onDark = tone === "dark";

  return (
    <div>
      <OrgTree variant="full" tone={tone} visibleState={state} />
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Organization growth states">
        {STATES.map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => setState(s.k)}
            aria-pressed={state === s.k}
            className={`rounded-full border px-4 py-1.5 font-mono text-3xs uppercase tracking-[0.2em] transition-colors ${
              state === s.k
                ? "border-orq8-green/60 bg-orq8-lime/10 text-orq8-green"
                : onDark
                  ? "border-white/10 text-fog hover:border-white/25 hover:text-orq8-green"
                  : "border-orq8-dark/15 text-muted hover:border-orq8-dark/40 hover:text-orq8-dark"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p
        className={`mt-6 text-center font-mono text-overline uppercase tracking-[0.22em] ${
          onDark ? "text-fog" : "text-muted"
        }`}
      >
        Node count extends as work requires
      </p>
    </div>
  );
}
