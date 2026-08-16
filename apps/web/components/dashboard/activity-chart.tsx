"use client";

import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";
import dynamic from "next/dynamic";

// Dynamically import react-apexcharts with Next.js dynamic import
const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

// Ported from the Trezo template (Dashboard/eCommerce/ReturningCustomerRate.tsx):
// trezo-card with a range dropdown and a full-width line chart. Re-skinned
// as ORQ8 agent activity in the brand palette.
export function ActivityChart() {
  const [isChartLoaded, setChartLoaded] = useState(false);

  useEffect(() => {
    setChartLoaded(true);
  }, []);

  const series = [
    { name: "Agent actions", data: [70, 23, 40, 30, 62, 52, 90, 20, 60, 53] },
    { name: "Approvals", data: [15, 58, 45, 38, 70, 50, 55, 60, 78, 40] },
  ];

  const options: ApexOptions = {
    chart: {
      toolbar: { show: false },
      zoom: { enabled: false },
    },
    colors: ["#34d399", "#c8ff32"],
    dataLabels: { enabled: false },
    stroke: { width: 2, curve: "smooth" },
    grid: { show: true, borderColor: "#ECEEF2" },
    xaxis: {
      categories: ["01 Aug", "02 Aug", "03 Aug", "04 Aug", "05 Aug", "06 Aug", "07 Aug", "08 Aug", "09 Aug", "10 Aug"],
      axisTicks: { show: false, color: "#ECEEF2" },
      axisBorder: { show: false, color: "#ECEEF2" },
      labels: { style: { colors: "#8695AA", fontSize: "12px" } },
    },
    yaxis: {
      labels: { style: { colors: "#64748B", fontSize: "12px" } },
      axisBorder: { show: false, color: "#ECEEF2" },
      axisTicks: { show: false, color: "#ECEEF2" },
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "right",
      fontSize: "12px",
      itemMargin: { horizontal: 8, vertical: 0 },
      labels: { colors: "#64748B" },
      markers: { size: 6, offsetX: -2, offsetY: -0.5, shape: "circle" },
    },
    tooltip: {
      y: { formatter: (val: number) => `${val} actions` },
    },
  };

  return (
    <div className="trezo-card mb-[25px] rounded-md bg-white p-[20px] dark:bg-[#0c1427] md:p-[25px]">
      <div className="trezo-card-header mb-[20px] flex items-center justify-between md:mb-[25px]">
        <div className="trezo-card-title">
          <h5 className="!mb-0">Agent activity</h5>
        </div>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald">
          68 actions this week
        </span>
      </div>

      <div className="trezo-card-content">
        {isChartLoaded && (
          <Chart options={options} series={series} type="line" height={321} />
        )}
        <p className="!mb-0 mt-[15px] border-t border-gray-100 pt-[15px] text-sm text-muted dark:border-[#172036]">
          Every action is traceable in the{" "}
          <a
            href="/app/activity"
            className="font-medium text-navy-800 hover:text-emerald"
          >
            activity log
          </a>
          , with the &quot;because&quot; behind it.
        </p>
      </div>
    </div>
  );
}
