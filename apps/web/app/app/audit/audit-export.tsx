"use client";

import { useState } from "react";
import { Download, FileText, FileJson } from "lucide-react";

interface AuditEvent {
  id: number | string;
  occurred_at?: string;
  occurredAt?: string;
  actor_type?: string;
  actorType?: string;
  actor_id?: string;
  actorId?: string;
  action?: string;
  outcome?: string;
  tool?: string;
  cost?: number;
  department?: string;
}

function formatCSV(events: AuditEvent[]): string {
  const headers = ["Time", "Actor Type", "Actor ID", "Action", "Outcome", "Tool", "Cost", "Department"];
  const rows = events.map((e) => [
    String(e.occurred_at ?? e.occurredAt ?? ""),
    String(e.actor_type ?? e.actorType ?? "system"),
    String(e.actor_id ?? e.actorId ?? ""),
    String(e.action ?? ""),
    String(e.outcome ?? ""),
    String(e.tool ?? ""),
    String(e.cost ?? 0),
    String(e.department ?? ""),
  ]);
  return [headers.join(","), ...rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(","))].join("\n");
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AuditExport({ events }: { events: AuditEvent[] }) {
  const [showDropdown, setShowDropdown] = useState(false);

  const handleExportCSV = () => {
    const csv = formatCSV(events);
    const date = new Date().toISOString().split("T")[0];
    downloadFile(csv, `orq8-audit-${date}.csv`, "text/csv");
    setShowDropdown(false);
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(events, null, 2);
    const date = new Date().toISOString().split("T")[0];
    downloadFile(json, `orq8-audit-${date}.json`, "application/json");
    setShowDropdown(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowDropdown(!showDropdown)}
        disabled={events.length === 0}
        className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" />
        Export ({events.length})
      </button>
      {showDropdown && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-hairline bg-white shadow-lg">
            <button
              type="button"
              onClick={handleExportCSV}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-canvas rounded-t-lg"
            >
              <FileText className="h-4 w-4 text-muted" />
              Export as CSV
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-ink hover:bg-canvas rounded-b-lg"
            >
              <FileJson className="h-4 w-4 text-muted" />
              Export as JSON
            </button>
          </div>
        </>
      )}
    </div>
  );
}
