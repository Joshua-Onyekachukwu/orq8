"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { PageErrorBoundary } from "../../../components/page-error-boundary";
import {
  FileText,
  Upload,
  Trash2,
  Download,
  AlertCircle,
  RefreshCw,
  Loader2,
  Clock,
  HardDrive,
} from "lucide-react";

/**
 * Files (docs/71 §L, marketing/headquarters-mock-v2.html `screen-files`).
 *
 * The mock's composition: a dropzone that states what uploading means (shared
 * company knowledge), then **folders per department** with each file's
 * producer, date and size — and an explained empty folder rather than a blank
 * one. Files come only from real uploads; there is nothing pre-seeded, so an
 * empty state is the honest state.
 */

interface FileRecord {
  id: string;
  name: string;
  key: string;
  mimeType: string;
  size: number;
  uploadedBy: string | null;
  createdAt: string;
}

interface DepartmentRow {
  id: string;
  name: string;
  status: string;
  agentCount: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileGlyph(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  return "▤";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [departments, setDepartments] = useState<DepartmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [filesRes, deptsRes] = await Promise.all([fetch("/api/files"), fetch("/api/departments?all=true")]);
      if (filesRes.ok) setFiles((await filesRes.json()).data ?? []);
      if (deptsRes.ok) setDepartments((await deptsRes.json()).data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(`Uploading ${file.name}…`);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), ""),
      );

      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          body: base64,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error?.message ?? "Upload failed");
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? Every employee loses access to it.`)) return;
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (previewFile?.id === id) setPreviewFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleDownload = async (id: string, name: string) => {
    try {
      const res = await fetch(`/api/files/${id}/download`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  };

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  // The mock's folders are departments. Files uploaded by the founder (no
  // department provenance on a file row) land in the company folder, which is
  // real too — just not attributable to a department.
  const folders = useMemo(() => {
    const byDept = new Map<string, FileRecord[]>();
    const unfiled: FileRecord[] = [];
    for (const file of files) unfiled.push(file);
    const list: { key: string; name: string; files: FileRecord[]; departmentId?: string }[] = [
      { key: "company", name: "Company", files: unfiled },
    ];
    for (const dept of departments) {
      list.push({ key: dept.id, name: dept.name, files: byDept.get(dept.id) ?? [], departmentId: dept.id });
    }
    return list;
  }, [files, departments]);

  const visibleFolders = filter === "all" ? folders : folders.filter((f) => f.key === filter);

  return (
    <PageErrorBoundary pageName="Files" backHref="/app">
      <div className="space-y-4">
        <header className="console-card flex flex-wrap items-end justify-between gap-4 p-5">
          <div>
            <p className="font-mono text-2xs font-semibold uppercase tracking-wide text-muted">
              Knowledge · {files.length} {files.length === 1 ? "file" : "files"} ·{" "}
              {formatSize(totalSize)}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">Files</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Everything employees and you have stored. Files come only from real uploads — nothing
              is pre-seeded.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              aria-label="Refresh files"
              onClick={fetchData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-hairline-strong px-3 py-1.5 text-xs text-ink transition-colors hover:bg-elevated disabled:opacity-40"
            >
              <RefreshCw aria-hidden="true" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleUpload}
              className="hidden"
              accept="*/*"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: "var(--orq-warm)", color: "var(--orq-on-warm)" }}
            >
              {uploading ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {uploading ? "Uploading…" : "Upload file"}
            </button>
          </div>
        </header>

        {/* What uploading means, stated where the button is (the mock's dropzone). */}
        <div
          className="console-card p-4 text-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files?.length > 0 && fileInputRef.current) {
              const transfer = new DataTransfer();
              for (const f of e.dataTransfer.files) transfer.items.add(f);
              fileInputRef.current.files = transfer.files;
              fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }
          }}
        >
          <p className="text-xs text-muted">
            <span className="font-semibold text-ink">Drop files here</span> or use Upload. Uploaded
            files are shared company knowledge — every employee can read them.
          </p>
        </div>

        {uploadProgress && (
          <div className="flex items-center gap-3 rounded-lg border border-hairline bg-elevated px-4 py-3">
            <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-muted" />
            <p className="text-sm text-ink">{uploadProgress}</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-hairline bg-error-soft/40 px-3.5 py-2.5">
            <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-error-ink" />
            <p className="text-sm text-error-ink">{error}</p>
            <button type="button" onClick={() => setError(null)} className="ml-auto text-2xs text-muted hover:text-ink">
              Dismiss
            </button>
          </div>
        )}

        {/* Filter chips are the folders this org actually has. */}
        {folders.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {[{ key: "all", name: "All" }, ...folders].map((folder) => {
              const active = filter === folder.key;
              return (
                <button
                  key={folder.key}
                  type="button"
                  onClick={() => setFilter(folder.key)}
                  aria-pressed={active}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    active
                      ? "border-hairline-strong bg-elevated text-ink"
                      : "border-hairline text-muted hover:border-hairline-strong hover:text-ink"
                  }`}
                >
                  {folder.name}
                </button>
              );
            })}
          </div>
        )}

        {loading && files.length === 0 ? (
          <div className="console-card p-6">
            <p className="text-sm text-muted">Reading the file store…</p>
          </div>
        ) : files.length === 0 ? (
          <div className="console-card p-10 text-center">
            <HardDrive aria-hidden="true" className="mx-auto h-8 w-8 text-muted/40" />
            <p className="mt-3 text-sm font-medium text-ink">No files yet</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted">
              Upload a brief, a dataset or a draft and every employee can read it. Files employees
              produce in tasks will be listed under their department as that work lands.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {visibleFolders.map((folder) => (
              <section key={folder.key} className="console-card p-4">
                <div className="flex items-center gap-2 border-b border-hairline pb-2.5">
                  <span aria-hidden="true" className="text-sm text-muted">
                    ◫
                  </span>
                  <h2 className="text-sm font-semibold text-ink">{folder.name}</h2>
                  <span className="ml-auto font-mono text-3xs text-muted">
                    {folder.files.length === 0 ? "Empty" : `${folder.files.length} ${folder.files.length === 1 ? "file" : "files"}`}
                  </span>
                </div>
                {folder.files.length === 0 ? (
                  <p className="pt-3 text-xs text-muted">
                    {folder.departmentId
                      ? "No files here yet. Files appear under a department when its employees produce them."
                      : "Upload something, or wait for task output to land here."}
                  </p>
                ) : (
                  <ul>
                    {folder.files.map((file) => (
                      <li
                        key={file.id}
                        className="flex items-center gap-3 border-b border-hairline py-2.5 last:border-b-0"
                      >
                        <span aria-hidden="true" className="shrink-0 text-sm text-muted">
                          {fileGlyph(file.mimeType)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPreviewFile(file)}
                          className="min-w-0 flex-1 truncate text-left text-xs text-ink transition-colors hover:text-brand-ink"
                        >
                          {file.name}
                        </button>
                        <span className="shrink-0 font-mono text-3xs text-muted">
                          {formatDate(file.createdAt)} · {formatSize(file.size)}
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleDownload(file.id, file.name)}
                            aria-label={`Download ${file.name}`}
                            className="rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-ink"
                          >
                            <Download aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(file.id, file.name)}
                            aria-label={`Delete ${file.name}`}
                            className="rounded-md p-1.5 text-muted transition-colors hover:bg-error-soft hover:text-error-ink"
                          >
                            <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        <p className="flex items-center gap-1.5 text-3xs text-muted">
          <Clock aria-hidden="true" className="h-3 w-3" />
          Uploaded files are readable by every employee in the company.
        </p>
      </div>

      {/* Preview modal */}
      {previewFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-surface/60 p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div
            className="relative max-h-[80vh] w-full max-w-3xl rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <span aria-hidden="true">{fileGlyph(previewFile.mimeType)}</span>
                <span className="truncate text-sm font-medium text-ink">{previewFile.name}</span>
                <span className="shrink-0 font-mono text-3xs text-muted">{formatSize(previewFile.size)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => handleDownload(previewFile.id, previewFile.name)}
                  aria-label="Download"
                  className="rounded-md p-2 text-muted hover:bg-elevated hover:text-ink"
                >
                  <Download aria-hidden="true" className="h-4 w-4" />
                </button>
                <button onClick={() => setPreviewFile(null)} aria-label="Close preview" className="rounded-md p-2 text-muted hover:bg-elevated hover:text-ink">
                  ×
                </button>
              </div>
            </div>
            <div className="p-4">
              {previewFile.mimeType.startsWith("image/") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/files/${previewFile.id}/download`}
                  alt={previewFile.name}
                  className="mx-auto max-h-[60vh] rounded-lg object-contain"
                />
              ) : previewFile.mimeType.includes("pdf") ? (
                <iframe
                  src={`/api/files/${previewFile.id}/download`}
                  className="h-[60vh] w-full rounded-lg border"
                  title={previewFile.name}
                />
              ) : (
                <div className="py-10 text-center">
                  <FileText aria-hidden="true" className="mx-auto h-10 w-10 text-muted/30" />
                  <p className="mt-3 text-sm text-muted">Preview not available for this file type</p>
                  <button
                    type="button"
                    onClick={() => handleDownload(previewFile.id, previewFile.name)}
                    className="btn-ghost-white mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                  >
                    <Download aria-hidden="true" className="h-3.5 w-3.5" /> Download to view
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageErrorBoundary>
  );
}
