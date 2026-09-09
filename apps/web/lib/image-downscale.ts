/**
 * Client-side avatar downscaling (apps/web).
 *
 * Large phone photos (4000px+) are resized to fit within 512px in the
 * browser via canvas before they are uploaded, so the API receives a
 * ~30-150KB payload instead of multi-megabyte originals. Server-side
 * validation (MIME allowlist, magic bytes, 2 MB cap) remains the source
 * of truth — this is a payload optimizer, not a security control.
 *
 * Failure policy: every browser-API failure throws; AvatarControl catches
 * and falls back to uploading the original file. Downscaling must never
 * make an upload *fail* that would otherwise succeed.
 */

export const AVATAR_MAX_DIMENSION = 512;

/** Should this image be downscaled? Pure and testable. */
export function shouldDownscale(width: number, height: number, maxDim = AVATAR_MAX_DIMENSION): boolean {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  if (width <= 0 || height <= 0) return false;
  return Math.max(width, height) > maxDim;
}

/**
 * Fit-within-max dimensions, never upscale, never return 0. Pure and testable.
 */
export function targetDimensions(
  width: number,
  height: number,
  maxDim = AVATAR_MAX_DIMENSION,
): { width: number; height: number } {
  const scale = maxDim / Math.max(width, height);
  // Math.round can round up for the long edge (e.g. 511.6 → 512, fine) and
  // the short edge may round to 0 for extreme aspect ratios — clamp to 1.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Downscale an image File/Blob to fit within `maxDim` on its long edge.
 * Output type follows the source (PNG stays PNG to preserve transparency,
 * JPEG stays JPEG, WebP stays WebP) — but the browser's actual encoded
 * type wins (Safari silently encodes unsupported targets as PNG), and the
 * returned mimeType reflects the *blob's* real type so the server's
 * allowlist check and magic-byte sniff stay consistent.
 */
export async function downscaleImage(
  file: Blob,
  maxDim = AVATAR_MAX_DIMENSION,
): Promise<{ blob: Blob; mimeType: string; width: number; height: number }> {
  const bitmap = await loadBitmap(file);
  try {
    if (!shouldDownscale(bitmap.width, bitmap.height, maxDim)) {
      // Small enough already — hand back the original bytes untouched
      // (no re-encode quality loss, no wasted work).
      return { blob: file, mimeType: file.type, width: bitmap.width, height: bitmap.height };
    }
    const { width, height } = targetDimensions(bitmap.width, bitmap.height, maxDim);

    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement("canvas"), { width, height });
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);

    const targetType = pickTargetType(file.type);
    const blob = await canvasToBlob(canvas, targetType);
    return { blob, mimeType: blob.type || targetType, width, height };
  } finally {
    if ("close" in bitmap) bitmap.close();
  }
}

async function loadBitmap(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // Honor EXIF orientation (phone photos are frequently rotated).
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // fall through to <img> path
      }
    }
  }
  // <img> fallback — modern browsers apply EXIF orientation by default.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
    return img;
  } finally {
    // The image is decoded; the object URL is no longer needed.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function pickTargetType(sourceType: string): string {
  switch (sourceType) {
    case "image/jpeg":
      return "image/jpeg";
    case "image/webp":
      return "image/webp";
    default:
      // PNG (and anything unknown): PNG preserves transparency.
      return "image/png";
  }
}

function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement, type: string): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob returned null"))),
      type,
      // Quality hint (JPEG/WebP only; ignored for PNG).
      0.85,
    );
  });
}
