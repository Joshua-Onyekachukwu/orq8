"use client";

import { FileJson, FileText } from "lucide-react";

/**
 * Export the rows currently on screen (mock `screen-audit`).
 *
 * Deliberately client-side over the loaded page: an export that quietly
 * reaches for a different, larger dataset than the one the founder is looking
 * at is an export nobody can check. The hashes travel with the rows so an
 * exported file is self-verifying.
 */

export interface AuditExportRow {
  id: number;
  occurredAt: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  actorKind: string;
  action: string;
  outcome: string;
  tool: string | null;
  cost: number | null;
  taskId: string | null;
  approvalId: string | null;
  inputRef: string | null;
  resultRef: string | null;
  prevHash: string;
  hash: string;
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toCsv(rows: AuditExportRow[]): string {
  const headers = [
    "id",
    "occurred_at",
    "actor_type",
    "actor_id",
    "actor_name",
    "action",
    "outcome",
    "tool",
    "cost_cents",
    "task_id",
    "approval_id",
    "input_ref",
    "result_ref",
    "prev_hash",
    "hash",
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.occurredAt,
      row.actorType,
      row.actorId,
      row.actorName,
      row.action,
      row.outcome,
      row.tool,
      row.cost,
      row.taskId,
      row.approvalId,
      row.inputRef,
      row.resultRef,
      row.prevHash,
      row.hash,
    ]
      .map(csvCell)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

function download(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AuditExport({ rows }: { rows: AuditExportRow[] }) {
  const stamp = new Date().toISOString().split("T")[0];
  const disabled = rows.length === 0;
  const buttonClass =
    "inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40";

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => download(toCsv(rows), `orq8-audit-${stamp}.csv`, "text/csv")}
        className={buttonClass}
      >
        <FileText aria-hidden="true" className="h-3.5 w-3.5" />
        Export CSV
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() =>
          download(JSON.stringify(rows, null, 2), `orq8-audit-${stamp}.json`, "application/json")
        }
        className={buttonClass}
      >
        <FileJson aria-hidden="true" className="h-3.5 w-3.5" />
        Export JSON
      </button>
    </>
  );
}
