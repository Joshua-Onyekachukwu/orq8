"use client";

import React from "react";
import Link from "next/link";

const comparisonData = [
  { feature: "AI Employees", founder: "3", team: "10", company: "25" },
  { feature: "Work Credits (included/mo)", founder: "1,000", team: "4,000", company: "12,000" },
  { feature: "Executive Agent", founder: true, team: true, company: true },
  { feature: "Company Memory", founder: true, team: true, company: true },
  { feature: "Goals & Tasks", founder: true, team: true, company: true },
  { feature: "Approval Gates", founder: "Basic", team: "Advanced", company: "Advanced" },
  { feature: "Integrations", founder: "Core", team: "Advanced", company: "All" },
  { feature: "API Access", founder: false, team: true, company: true },
  { feature: "Audit Trail", founder: "Basic", team: "Full", company: "Full" },
  { feature: "Analytics", founder: "Basic", team: "Advanced", company: "Advanced" },
  { feature: "Custom AI Employees", founder: false, team: true, company: true },
  { feature: "Priority Execution", founder: false, team: true, company: true },
  { feature: "Team Collaboration", founder: false, team: true, company: true },
  { feature: "Advanced Controls", founder: false, team: false, company: true },
  { feature: "Advanced Governance", founder: false, team: false, company: true },
  { feature: "Advanced Memory", founder: false, team: false, company: true },
  { feature: "Priority Support", founder: false, team: true, company: true },
  { feature: "Organizations", founder: "1", team: "3", company: "Unlimited" },
];

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <span className="inline-flex items-center justify-center w-[24px] h-[24px] rounded-full bg-ink-accent/15">
        <svg className="w-[14px] h-[14px] text-brand-ink" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </span>
    ) : (
      <span className="inline-flex items-center justify-center w-[24px] h-[24px] rounded-full bg-surface-secondary">
        <svg className="w-[12px] h-[12px] text-ink-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
        </svg>
      </span>
    );
  }
  return <span className="text-sm text-brand-ink font-medium">{value}</span>;
}

const PricingComparison: React.FC = () => {
  return (
    <div className="relative py-[40px] md:py-[60px] lg:py-[80px]">
      <div className="container sm:max-w-[540px] md:max-w-[720px] lg:max-w-[960px] xl:max-w-[1200px] mx-auto px-[20px] md:px-[24px]">
        <div className="mb-[30px] md:mb-[40px] text-center">
          <span className="block uppercase font-bold tracking-[0.2em] text-overline text-warm-ink mb-[12px]">
            Compare plans
          </span>
          <h2 className="!text-black !font-normal !text-[28px] md:!text-[36px] lg:!text-[42px] -tracking-[0.5px] md:-tracking-[1px]">
            Full feature comparison
          </h2>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-hairline">
                <th className="text-left py-[16px] px-[20px] text-2sm font-semibold text-ink-muted uppercase tracking-wider w-[35%]">
                  Feature
                </th>
                <th className="text-center py-[16px] px-[20px] w-[22%]">
                  <span className="text-xs font-bold uppercase tracking-wider text-warm-ink">Founder</span>
                  <span className="block text-overline text-ink-muted mt-[2px]">$39/mo</span>
                </th>
                <th className="text-center py-[16px] px-[20px] w-[22%] bg-brand-deep/[0.03] rounded-t-[8px]">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-ink">Team</span>
                  <span className="block text-overline text-ink-muted mt-[2px]">$99/mo</span>
                  <span className="inline-block mt-[4px] text-2xs font-bold uppercase tracking-wider bg-warm text-ink px-[8px] py-[2px] rounded-full">Popular</span>
                </th>
                <th className="text-center py-[16px] px-[20px] w-[22%]">
                  <span className="text-xs font-bold uppercase tracking-wider text-warm-ink">Company</span>
                  <span className="block text-overline text-ink-muted mt-[2px]">$249/mo</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonData.map((row, i) => (
                <tr key={i} className="border-b border-hairline-light hover:bg-surface-secondary/50 transition-colors">
                  <td className="py-[14px] px-[20px] text-sm text-ink font-medium">
                    {row.feature}
                  </td>
                  <td className="py-[14px] px-[20px] text-center">
                    <CellValue value={row.founder} />
                  </td>
                  <td className="py-[14px] px-[20px] text-center bg-brand-deep/[0.03]">
                    <CellValue value={row.team} />
                  </td>
                  <td className="py-[14px] px-[20px] text-center">
                    <CellValue value={row.company} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-[20px] px-[20px]" />
                <td className="py-[20px] px-[20px] text-center">
                  <Link href="/register" className="inline-block rounded-full border border-hairline px-[20px] py-[10px] text-overline font-bold uppercase tracking-wider text-ink-muted hover:border-brand-deep hover:text-brand-ink transition-colors">
                    Start free trial
                  </Link>
                </td>
                <td className="py-[20px] px-[20px] text-center bg-brand-deep/[0.03] rounded-b-[8px]">
                  <Link href="/register" className="inline-block rounded-full bg-brand-deep px-[20px] py-[10px] text-overline font-bold uppercase tracking-wider text-white hover:bg-brand transition-colors">
                    Start free trial
                  </Link>
                </td>
                <td className="py-[20px] px-[20px] text-center">
                  <Link href="/register" className="inline-block rounded-full border border-hairline px-[20px] py-[10px] text-overline font-bold uppercase tracking-wider text-ink-muted hover:border-brand-deep hover:text-brand-ink transition-colors">
                    Start free trial
                  </Link>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-[20px]">
          {comparisonData.map((row, i) => (
            <div key={i} className="border-b border-hairline-light pb-[16px]">                    <p className="text-2sm font-semibold text-ink-muted uppercase tracking-wider mb-[10px]">
                {row.feature}
              </p>
              <div className="grid grid-cols-3 gap-[12px]">
                <div className="text-center">                      <p className="text-3xs font-bold uppercase text-ink-muted mb-[4px]">Founder</p>
                  <CellValue value={row.founder} />
                </div>
                <div className="text-center bg-brand-deep/[0.03] rounded-[6px] py-[4px]">
                  <p className="text-3xs font-bold uppercase text-brand-ink mb-[4px]">Team</p>
                  <CellValue value={row.team} />
                </div>
                <div className="text-center">                      <p className="text-3xs font-bold uppercase text-ink-muted mb-[4px]">Company</p>
                  <CellValue value={row.company} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PricingComparison;
