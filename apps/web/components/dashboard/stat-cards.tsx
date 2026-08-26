"use client";

import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

// Dynamically import react-apexcharts with Next.js dynamic import
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// ORQ8 stat card: header row with label + delta chip + period, big figure,
// mini bar chart, then a two-item legend list. Metrics are ORQ8 operating
// numbers; charts use the brand emerald/lime palette.
type Stat = {
  label: string;
  value: string;
  delta: string;
  deltaClass: string; // e.g. "bg-success-50 text-success-500"
  period: string;
  series: { name: string; data: number[] }[];
  colors: string[];
  legend: { label: string; value: string; color: string }[];
};

const stats: Stat[] = [
  {
    label: "Agents active",
    value: "03",
    delta: "+1",
    deltaClass: "bg-success-50 text-success-600",
    period: "This week",
    series: [
      { name: "Active", data: [2, 2, 3, 3, 2, 3, 3] },
      { name: "Paused", data: [1, 1, 0, 1, 1, 0, 0] },
    ],
    colors: ["#34d399", "#c8ff32"],
    legend: [
      { label: "Working now", value: "3", color: "bg-emerald" },
      { label: "Paused", value: "0", color: "bg-lime" },
    ],
  },
  {
    label: "Tasks this week",
    value: "14",
    delta: "+12%",
    deltaClass: "bg-success-50 text-success-600",
    period: "Last 7 days",
    series: [
      { name: "Done", data: [9, 12, 11, 14, 12, 13, 12] },
      { name: "In review", data: [2, 3, 2, 2, 3, 2, 2] },
    ],
    colors: ["#34d399", "#1f64f1"],
    legend: [
      { label: "Completed", value: "12", color: "bg-emerald" },
      { label: "In review", value: "2", color: "bg-secondary-500" },
    ],
  },
  {
    label: "Weekly spend",
    value: "$14.20",
    delta: "-8%",
    deltaClass: "bg-success-50 text-success-600",
    period: "Last 7 days",
    series: [
      { name: "Used", data: [1.2, 2.4, 1.8, 2.9, 2.2, 2.1, 1.6] },
      { name: "Budget", data: [2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5] },
    ],
    colors: ["#34d399", "#d1d6e0"],
    legend: [
      { label: "Used", value: "$14.20", color: "bg-emerald" },
      { label: "Daily cap", value: "$2.50", color: "bg-hairline" },
    ],
  },
  {
    label: "Approvals pending",
    value: "02",
    delta: "2 due",
    deltaClass: "bg-warning-50 text-warning-500",
    period: "Awaiting you",
    series: [
      { name: "Pending", data: [3, 2, 4, 2, 3, 2, 2] },
      { name: "Resolved", data: [5, 6, 4, 7, 5, 6, 7] },
    ],
    colors: ["#fd5812", "#34d399"],
    legend: [
      { label: "Awaiting", value: "2", color: "bg-orange-500" },
      { label: "Resolved", value: "7", color: "bg-emerald" },
    ],
  },
];

function StatCard({ stat }: { stat: Stat }) {
  const [isChartLoaded, setChartLoaded] = useState(false);

  useEffect(() => {
    setChartLoaded(true);
  }, []);

  const options: ApexOptions = {
    chart: {
      toolbar: { show: false },
      sparkline: { enabled: false },
    },
    colors: stat.colors,
    plotOptions: {
      bar: { columnWidth: "80%", borderRadius: 2 },
    },
    dataLabels: { enabled: false },
    stroke: { width: 2, show: true, colors: ["transparent"] },
    grid: { show: false },
    xaxis: {
      categories: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      axisTicks: { show: false },
      axisBorder: { show: false },
      labels: { show: false },
    },
    yaxis: { show: false },
    legend: { show: false },
    tooltip: { enabled: false },
  };

  return (
    <div className="orq8-card mb-[25px] rounded-md bg-white p-[20px] dark:bg-[#0c1427] md:p-[25px]">
      <div className="orq8-card-content">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="block">{stat.label}</span>
            <span
              className={`ml-[10px] inline-block rounded-[100px] border px-[8.3px] py-[1px] text-sm ${
                stat.deltaClass
              }`}
            >
              {stat.delta}
            </span>
          </div>
          <span className="block text-sm">{stat.period}</span>
        </div>

        <h5 className="!mb-0 !mt-[5px] !text-lg md:!text-[20px]">{stat.value}</h5>

        <div className="mx-auto -mb-[10px] -mt-[10px] max-w-[150px] md:-mb-[16px] md:-mt-[25px]">
          {isChartLoaded && (
            <Chart
              options={options}
              series={stat.series}
              type="bar"
              height={100}
              width="100%"
            />
          )}
        </div>

        <ul>
          {stat.legend.map((item) => (
            <li
              key={item.label}
              className="relative mb-[4px] flex justify-between pl-[30px] text-sm last:mb-0"
            >
              <span
                className={`absolute left-0 top-1/2 inline-block h-[5px] w-[20px] -translate-y-1/2 rounded-md ${item.color}`}
              ></span>
              <span className="block">{item.label}</span>
              <span className="block">{item.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function StatCards() {
  return (
    <div className="grid gap-[25px] lg:grid-cols-2 xl:grid-cols-4">
      {stats.map((s) => (
        <StatCard key={s.label} stat={s} />
      ))}
    </div>
  );
}
