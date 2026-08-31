"use client";

import React from "react";
import { useInView } from "@/hooks/useInView";

/* ───────────────────────────────────────────────────────────────
   Integrations — real brand icons + two-row counter-scrolling marquees.
   Row 1: Right → Left. Row 2: Left → Right.
   Each integration shows its actual recognizable icon/brand mark.
   ─────────────────────────────────────────────────────────────── */

interface IntegrationTool {
  name: string;
  color: string;
  svg: React.ReactNode;
}

/* Row A: scrolls left */
const rowA: IntegrationTool[] = [
  {
    name: "GitHub",
    color: "#8b949e",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
  {
    name: "Slack",
    color: "#4A154B",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
    ),
  },
  {
    name: "Figma",
    color: "#F24E1E",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M15.852 8.981h-4.588V0h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zM12.735 7.51h3.117c1.665 0 3.019-1.355 3.019-3.019s-1.355-3.019-3.019-3.019h-3.117V7.51zm0 8.942h-4.588c-2.476 0-4.49-2.014-4.49-4.49s2.014-4.49 4.49-4.49h4.588v8.98zM3.657 7.51c-1.665 0-3.019 1.355-3.019 3.019s1.355 3.019 3.019 3.019h3.117V7.51H3.657zm4.588 11.963c-2.476 0-4.49-2.014-4.49-4.49v-4.491h4.588c2.476 0 4.49 2.014 4.49 4.49s-2.014 4.491-4.49 4.491zm-1.471-4.491c0 1.665 1.355 3.019 3.019 3.019s3.019-1.355 3.019-3.019-1.355-3.019-3.019-3.019-3.019 1.355-3.019 3.019zM15.852 24c2.476 0 4.49-2.014 4.49-4.49s-2.014-4.491-4.49-4.491h-4.588V24h4.588zm-1.471-4.491c0 1.665 1.355 3.019 3.019 3.019s3.019-1.355 3.019-3.019-1.355-3.019-3.019-3.019-3.019 1.355-3.019 3.019z" />
      </svg>
    ),
  },
  {
    name: "Notion",
    color: "#000000",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.2 2.16c-.42-.326-.98-.7-2.055-.607l-12.8.934c-.466.047-.56.28-.374.466zm.793 3.081v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.166V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.046-.747.326-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.515-1.635.515-.748 0-.935-.234-1.498-.933l-4.579-7.186v6.952l1.449.327s0 .84-1.169.84l-3.222.187c-.093-.187 0-.653.327-.746l.84-.233V9.854c0-.841.327-1.168.934-1.168l3.642-.233 4.906 7.466V9.154l-1.215-.14c-.093-.515.28-.886.747-.933zM2.24 1.627l13.355-.981c1.635-.14 2.055-.047 3.082.7l4.259 2.986c.7.513.933.653.933 1.213v16.378c0 1.028-.373 1.635-1.68 1.728l-15.458.934c-.98.046-1.449-.093-1.963-.747l-3.129-4.06c-.56-.746-.793-1.306-.793-1.96V3.308c0-.84.373-1.54 1.402-1.68z" />
      </svg>
    ),
  },
  {
    name: "OpenAI",
    color: "#10A37F",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.872zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v3.005l-2.607 1.5-2.602-1.5z" />
      </svg>
    ),
  },
  {
    name: "Anthropic",
    color: "#D97757",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0h3.767L16.906 20.48h-3.674l-1.632-4.327H5.091l-1.66 4.327H0L6.57 3.52zm1.07 5.41l-2.057 5.343h4.147l-2.057-5.343z" />
      </svg>
    ),
  },
  {
    name: "Google",
    color: "#4285F4",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
      </svg>
    ),
  },
  {
    name: "Microsoft",
    color: "#00A4EF",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zm12.6 0H12.6V0H24v11.4z" />
      </svg>
    ),
  },
];

/* Row B: scrolls right */
const rowB: IntegrationTool[] = [
  {
    name: "Discord",
    color: "#5865F2",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
      </svg>
    ),
  },
  {
    name: "Stripe",
    color: "#635BFF",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.19L3.36 21.8C5.578 22.926 8.621 24 12.21 24c2.63 0 4.789-.657 6.28-1.88 1.67-1.36 2.518-3.327 2.518-5.735 0-4.17-2.508-5.867-7.03-7.235z" />
      </svg>
    ),
  },
  {
    name: "Linear",
    color: "#5E6AD2",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M3.35 19.01c-.55.56-.23 1.53.53 1.53h3.68c.33 0 .61-.22.7-.54l5.34-16.43c.12-.35.46-.58.82-.58h3.37c.86 0 1.37.96.82 1.52L7.2 19.02c-.56.56-1.35.56-1.91 0L3.35 19.01z" />
      </svg>
    ),
  },
  {
    name: "Jira",
    color: "#0052CC",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M11.396.004C5.15.004.004 5.15.004 11.396v1.208c0 6.247 5.146 11.392 11.392 11.392h1.208c6.247 0 11.392-5.146 11.392-11.392V11.396C24 5.15 18.854.004 12.604.004h-1.208zm-.59 4.766a.67.67 0 0 1 .672.672v3.146a.67.67 0 0 1-.672.672H9.538a.67.67 0 0 1-.672-.672V5.442a.67.67 0 0 1 .672-.672h1.268zm3.92 0a.67.67 0 0 1 .672.672v3.146a.67.67 0 0 1-.672.672h-1.268a.67.67 0 0 1-.672-.672V5.442a.67.67 0 0 1 .672-.672h1.268zm3.92 2.562a.67.67 0 0 1 .672.672v.584a.67.67 0 0 1-.672.672h-1.268a.67.67 0 0 1-.672-.672v-.584a.67.67 0 0 1 .672-.672h1.268z" />
      </svg>
    ),
  },
  {
    name: "Zapier",
    color: "#FF4F00",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M15.96 11.07h3.72l-4.38 4.38a3.6 3.6 0 0 1-5.09 0 3.6 3.6 0 0 1 0-5.09l4.38-4.38h-3.72a5.41 5.41 0 0 0-5.4 5.4c0 2.98 2.43 5.4 5.4 5.4s5.4-2.43 5.4-5.4v-1.24h-.61zm-6.59 3.17a1.81 1.81 0 0 1 0-2.55 1.81 1.81 0 0 1 2.55 0l-2.55 2.55zM11.36 2.23h3.72l-4.38 4.38a3.6 3.6 0 0 1-5.09 0 3.6 3.6 0 0 1 0-5.09l4.38-4.38h-3.72a5.41 5.41 0 0 0-5.4 5.4c0 2.98 2.43 5.4 5.4 5.4s5.4-2.43 5.4-5.4v-1.24h-.61zm-6.59 3.17a1.81 1.81 0 0 1 0-2.55 1.81 1.81 0 0 1 2.55 0l-2.55 2.55z" />
      </svg>
    ),
  },
  {
    name: "Dropbox",
    color: "#0061FF",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M6 2l6 3.75L6 9.5 0 5.75zm12 0l6 3.75-6 3.75-6-3.75zm-12 11l6-3.75L18 13l-6 3.75zm12 0l6-3.75L18 13l-6 3.75zM6 15.25L12 19l6-3.75L12 11.5z" />
      </svg>
    ),
  },
  {
    name: "Gmail",
    color: "#EA4335",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
      </svg>
    ),
  },
  {
    name: "Trello",
    color: "#0079BF",
    svg: (
      <svg viewBox="0 0 24 24" className="w-[22px] h-[22px]" fill="currentColor">
        <path d="M21 0H3a3 3 0 0 0-3 3v18a3 3 0 0 0 3 3h18a3 3 0 0 0 3-3V3a3 3 0 0 0-3-3zM9 15H6V9h3v6zm5 0h-3V6h3v9zm5 0h-3V3h3v12z" />
      </svg>
    ),
  },
];

const ToolTile: React.FC<{ tool: IntegrationTool }> = ({ tool }) => (
  <div className="flex items-center gap-[12px] rounded-[12px] bg-white dark:bg-navy-900/60 border border-gray-100 dark:border-white/[0.06] px-[16px] py-[10px] shadow-sm hover:shadow-md transition-shadow whitespace-nowrap">
    <span
      className="w-[38px] h-[38px] rounded-[10px] flex items-center justify-center flex-none"
      style={{ backgroundColor: `${tool.color}12` }}
    >
      <span style={{ color: tool.color }} aria-hidden="true">{tool.svg}</span>
    </span>
    <span className="text-[14px] font-medium text-navy-950 dark:text-white/85 whitespace-nowrap -tracking-[0.15px]">
      {tool.name}
    </span>
  </div>
);

const Integrations: React.FC = () => {
  const { ref: row1Ref, inView: row1Visible } = useInView(0.05);
  const { ref: row2Ref, inView: row2Visible } = useInView(0.05);

  return (
    <div className="py-[70px] md:py-[90px] lg:py-[110px] xl:py-[130px] 2xl:py-[150px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1308px] mx-auto px-[12px]">
        {/* Section header */}
        <div className="mb-[30px] md:mb-[40px] lg:mb-[50px] mx-auto text-center lg:max-w-[700px]">
          <span className="block uppercase font-bold tracking-[1.8px] text-[11px] md:text-xs text-orange-400 mb-[8px] md:mb-[10px] lg:mb-[12px]">
            INTEGRATIONS
          </span>
          <h2 className="!mb-0 !text-[26px] md:!text-4xl lg:!text-[46px] -tracking-[1px] md:-tracking-[1.5px] lg:-tracking-[2.3px]">
            One organization,{" "}
            <span className="text-navy-900">connected to your stack</span>
          </h2>
          <p className="max-w-[520px] mx-auto mt-[12px] md:mt-[16px] text-gray-500 dark:text-gray-400">
            The tools you already use plug straight in. Same approvals, same
            budgets, same audit trail across all of them.
          </p>
        </div>
      </div>

      {/* Row 1: scrolls left */}
      <div
        ref={row1Ref}
        className="integrations-marquee relative overflow-hidden py-[8px]"
        role="presentation"
      >
        <div className="integrations-marquee-track flex items-center gap-[14px] md:gap-[18px] w-max" style={{ animationPlayState: row1Visible ? "running" : "paused" }}>
          {[...rowA, ...rowA, ...rowA, ...rowA].map((tool, i) => (
            <ToolTile key={`${tool.name}-${i}`} tool={tool} />
          ))}
        </div>
      </div>

      {/* ORQ8 hub divider */}
      <div className="flex items-center justify-center gap-[16px] md:gap-[22px] my-[24px] md:my-[32px] px-[20px]">
        <span
          aria-hidden
          className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-gray-200 dark:to-white/10"
        />
        <span className="flex items-center gap-[10px]">
          <span className="text-navy-950 dark:text-white font-bold tracking-[-0.6px] text-lg leading-none">
            ORQ8
          </span>
          <span className="w-[6px] h-[6px] rounded-full bg-lime animate-pulse-dot" />
          <span className="text-[10px] font-semibold uppercase tracking-[2.2px] text-gray-400">
            System online
          </span>
        </span>
        <span
          aria-hidden
          className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-gray-200 dark:to-white/10"
        />
      </div>

      {/* Row 2: scrolls right */}
      <div
        ref={row2Ref}
        className="integrations-marquee relative overflow-hidden py-[8px]"
        role="presentation"
      >
        <div className="integrations-marquee-track marquee-reverse flex items-center gap-[14px] md:gap-[18px] w-max" style={{ animationPlayState: row2Visible ? "running" : "paused" }}>
          {[...rowB, ...rowB, ...rowB, ...rowB].map((tool, i) => (
            <ToolTile key={`${tool.name}-${i}`} tool={tool} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Integrations;
