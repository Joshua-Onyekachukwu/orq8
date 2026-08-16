"use client";

import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

// Dynamically import react-apexcharts with Next.js dynamic import
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ORQ8 department budgets: donut chart + legend list with spend/total and
// the weekly-total footer, using the brand palette per department.
const budgets = [
  { dept: "Marketing", spent: "$620", total: "$1,000", pct: 62, color: "#34d399" },
  { dept: "Engineering", spent: "$470", total: "$1,000", pct: 47, color: "#1f64f1" },
  { dept: "Operations", spent: "$180", total: "$1,000", pct: 18, color: "#c8ff32" },
];

export function DeptBudgets() {
  const [isChartLoaded, setChartLoaded] = useState(false);

  useEffect(() => {
    setChartLoaded(true);
  }, []);

  const series = budgets.map((b) => b.pct);

  const options: ApexOptions = {
    labels: budgets.map((b) => b.dept),
    colors: budgets.map((b) => b.color),
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    tooltip: {
      y: { formatter: (val: number) => `${val}% used` },
    },
  };

  return (
    <div className="orq8-card mb-[25px] rounded-md bg-white p-[20px] dark:bg-[#0c1427] md:p-[25px]">
      <div className="orq8-card-header mb-[20px] flex items-center justify-between md:mb-[25px]">
        <div className="orq8-card-title">
          <h5 className="!mb-0">Dept budgets</h5>
        </div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          This week
        </span>
      </div>

      <div className="orq8-card-content">
        <div className="mx-auto max-w-[240px]">
          {isChartLoaded && (
            <Chart
              options={options}
              series={series}
              type="donut"
              height={220}
              width="100%"
            />
          )}
        </div>

        <ul className="mt-[20px]">
          {budgets.map((b) => (
            <li
              key={b.dept}
              className="relative mb-[4px] flex items-center justify-between pl-[30px] text-sm last:mb-0"
            >
              <span
                className={`absolute left-0 top-1/2 inline-block h-[5px] w-[20px] -translate-y-1/2 rounded-md`}
                style={{ backgroundColor: b.color }}
              ></span>
              <span className="block">{b.dept}</span>
              <span className="block font-mono text-xs tabular-nums text-muted">
                {b.spent} / {b.total} · {b.pct}%
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-[20px] rounded-md bg-canvas p-[14px]">
          <p className="flex items-center justify-between font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Weekly total <span className="text-emerald-700">$1,270 / $3,000</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            42% used · hard caps pause work before overspend (Phase 2)
          </p>
        </div>
      </div>
    </div>
  );
}
