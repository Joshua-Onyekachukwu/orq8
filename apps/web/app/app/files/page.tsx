"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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

interface FileRecord {
  id: string;
  name: string;
  key: string;
  mimeType: string;
  size: number;
  uploadedBy: string | null;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return "🖼";
  if (mimeType.includes("pdf")) return "📄";
  if (mimeType.includes("spreadsheet") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📝";
  return "📁";
}

export default function FilesPage() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/files");
      if (!res.ok) throw new Error("Failed to fetch files");
      const json = await res.json();
      setFiles(json.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);
    setError(null);

    try {
      // Read file as base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
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

      fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setFiles((prev) => prev.filter((f) => f.id !== id));
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

  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <>
    <PageErrorBoundary pageName="Files & Documents" backHref="/app">
    <div className="mx-auto max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1a5c2e]">
            Knowledge
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            Files & Documents
          </h1>
          <p className="mt-1 text-sm text-muted">
            Upload and manage files for your AI workforce. {files.length} files · {formatSize(totalSize)} total
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fetchFiles}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-white px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-canvas disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
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
            className="inline-flex items-center gap-1.5 rounded-full bg-[#1a5c2e] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#144a24] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            {uploading ? "Uploading..." : "Upload file"}
          </button>
        </div>
      </header>

      {uploadProgress && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
          <p className="text-sm text-blue-700">{uploadProgress}</p>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-xs text-red-500 hover:text-red-700">Dismiss</button>
        </div>
      )}

      {loading && files.length === 0 && (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-hairline bg-white p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded bg-hairline" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 rounded bg-hairline" />
                  <div className="h-3 w-1/4 rounded bg-hairline" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && files.length === 0 && (
        <div className="mt-6 rounded-xl border border-dashed border-hairline bg-white p-10 text-center">
          <HardDrive className="mx-auto h-10 w-10 text-muted/30" />
          <p className="mt-4 text-sm font-medium text-ink">No files uploaded yet</p>
          <p className="mt-1 text-sm text-muted">
            Upload documents, images, and files for your AI workforce to reference.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#1a5c2e] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[#144a24]"
          >
            <Upload className="h-3.5 w-3.5" /> Upload your first file
          </button>
        </div>
      )}

      {!loading && files.length > 0 && (
        <div className="mt-6 space-y-2">
          {files.map((file) => (
            <article key={file.id} className="flex items-center gap-4 rounded-xl border border-hairline bg-white px-5 py-4">
              <span className="text-2xl">{fileIcon(file.mimeType)}</span>
              <div className="min-w-0 flex-1">
                <p onClick={() => setPreviewFile(file)} className="truncate text-sm font-medium text-ink cursor-pointer hover:text-[#1a5c2e]">{file.name}</p>
                <div className="flex items-center gap-3 text-[10px] text-muted">
                  <span>{formatSize(file.size)}</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(file.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleDownload(file.id, file.name)}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-canvas hover:text-ink"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(file.id, file.name)}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
    </PageErrorBoundary>

      {/* Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewFile(null)}>
          <div className="relative max-h-[80vh] w-full max-w-3xl rounded-xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{fileIcon(previewFile.mimeType)}</span>
                <span className="text-sm font-medium text-ink">{previewFile.name}</span>
                <span className="text-xs text-muted">{formatSize(previewFile.size)}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => handleDownload(previewFile.id, previewFile.name)} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink" title="Download">
                  <Download className="h-4 w-4" />
                </button>
                <button onClick={() => setPreviewFile(null)} className="rounded-lg p-2 text-muted hover:bg-canvas hover:text-ink">×</button>
              </div>
            </div>
            <div className="p-4">
              {previewFile.mimeType.startsWith("image/") ? (
                <img src={`/api/files/${previewFile.id}/download`} alt={previewFile.name} className="mx-auto max-h-[60vh] rounded-lg object-contain" />
              ) : previewFile.mimeType.includes("pdf") ? (
                <iframe src={`/api/files/${previewFile.id}/download`} className="h-[60vh] w-full rounded-lg border" title={previewFile.name} />
              ) : (
                <div className="py-10 text-center">
                  <FileText className="mx-auto h-12 w-12 text-muted/30" />
                  <p className="mt-3 text-sm text-muted">Preview not available for this file type</p>
                  <button onClick={() => handleDownload(previewFile.id, previewFile.name)} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#1a5c2e] px-4 py-2 text-xs font-semibold text-white hover:bg-[#144a24]">
                    <Download className="h-3.5 w-3.5" /> Download to view
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
