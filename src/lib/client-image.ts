// Client-side image normalization for merchant/customer uploads.
//
// Phone cameras hand the browser HEIC files and multi-megabyte JPEGs; the
// upload API (src/app/api/upload/route.ts) correctly rejects both — HEIC
// isn't a supported MIME type and 5MB is a hard cap. Rather than relax
// those server-side guards, we decode and re-encode on the client before
// the file ever reaches fetch(), so a real phone photo has a normal shot
// at succeeding. This file is client-only (canvas, Image, createImageBitmap)
// and must never be imported from a server component or route handler.
import { MAX_UPLOAD_BYTES } from "@/lib/image-sniff";

export type NormalizeImageKind = "photo" | "qr";

export interface NormalizeImageOptions {
  /** Longest edge, in pixels, the output is capped at. Never upscales. */
  maxDimension?: number;
  /** "qr" re-encodes to PNG to keep modules crisp/scannable; "photo" (default) uses JPEG. */
  kind?: NormalizeImageKind;
}

const DEFAULT_MAX_DIMENSION = 1600;
const RETRY_JPEG_QUALITY = 0.7;
const DEFAULT_JPEG_QUALITY = 0.85;
const SUPPORTED_INPUT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// Thrown when the browser cannot decode the file at all — the classic case
// being HEIC opened on a non-Safari browser. Callers map this to a friendly
// message; it is never sent to the server.
export class ImageDecodeError extends Error {
  constructor() {
    super("This browser can't decode that image file.");
    this.name = "ImageDecodeError";
  }
}

// Server error code -> merchant/customer-facing copy. Never show the raw
// code (e.g. "INVALID_IMAGE") in the UI.
export const UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  INVALID_IMAGE: "That image format isn't supported. Please use a JPG, PNG, or WebP photo.",
  FILE_TOO_LARGE: "That image is too large (max 5MB). Try a smaller photo.",
  UNAUTHORIZED: "Upload failed. Please try again.",
};

export const IMAGE_DECODE_ERROR_MESSAGE =
  "That photo format isn't supported by your browser. Please use a JPG or PNG image.";

export function mapUploadError(error: string | undefined): string {
  if (error && UPLOAD_ERROR_MESSAGES[error]) return UPLOAD_ERROR_MESSAGES[error];
  return "Upload failed. Please try again.";
}

// Pure — extracted so it can be unit tested without touching canvas/Image.
// Scales width/height down to fit within maxDimension on the longest edge,
// preserving aspect ratio. Never upscales.
export function targetDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function decodeViaImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageDecodeError());
    };
    img.src = url;
  });
}

// createImageBitmap decodes HEIC natively on iOS Safari — exactly where HEIC
// files come from — so it's tried first. Chrome desktop (and older browsers)
// reject unsupported formats there; fall back to an <img> element, which
// fails the same way for HEIC but succeeds for anything the browser can
// paint. If both fail, the format genuinely isn't decodable here.
async function decodeSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      // fall through
    }
  }
  return decodeViaImageElement(file);
}

function sourceDimensions(source: ImageBitmap | HTMLImageElement): { width: number; height: number } {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight };
  }
  return { width: source.width, height: source.height };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ImageDecodeError());
      },
      type,
      quality
    );
  });
}

/**
 * Decodes `file`, downsizes it to fit `maxDimension` (default 1600px, no
 * upscaling), and re-encodes it (JPEG for "photo", PNG for "qr" so the
 * modules stay crisp/scannable). If the encoded output still exceeds the
 * server's 5MB cap, retries once at a lower JPEG quality — a QR re-encode
 * is left as-is since dropping to lossy JPEG would risk making it unscannable.
 *
 * An already-compliant file (supported type, under the size cap, within
 * maxDimension) is still decoded to read its dimensions but returned
 * untouched rather than re-encoded, to avoid a pointless quality hit.
 *
 * Throws ImageDecodeError if the browser can't decode the file at all
 * (e.g. HEIC opened outside Safari) — callers should show
 * IMAGE_DECODE_ERROR_MESSAGE, not send the file to the server.
 */
export async function normalizeImageForUpload(file: File, opts?: NormalizeImageOptions): Promise<File> {
  const maxDimension = opts?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const kind = opts?.kind ?? "photo";

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decodeSource(file);
  } catch {
    throw new ImageDecodeError();
  }

  const { width, height } = sourceDimensions(source);
  if (width <= 0 || height <= 0) {
    throw new ImageDecodeError();
  }

  if (
    SUPPORTED_INPUT_TYPES.has(file.type) &&
    file.size <= MAX_UPLOAD_BYTES &&
    width <= maxDimension &&
    height <= maxDimension
  ) {
    if (source instanceof ImageBitmap) source.close();
    return file;
  }

  const target = targetDimensions(width, height, maxDimension);
  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (source instanceof ImageBitmap) source.close();
    throw new ImageDecodeError();
  }
  ctx.drawImage(source, 0, 0, target.width, target.height);
  if (source instanceof ImageBitmap) source.close();

  const outputType = kind === "qr" ? "image/png" : "image/jpeg";
  const ext = kind === "qr" ? "png" : "jpg";

  let blob = await canvasToBlob(canvas, outputType, kind === "qr" ? undefined : DEFAULT_JPEG_QUALITY);
  if (blob.size > MAX_UPLOAD_BYTES && kind === "photo") {
    blob = await canvasToBlob(canvas, outputType, RETRY_JPEG_QUALITY);
  }

  const baseName = file.name.replace(/\.[^./\\]+$/, "") || "image";
  return new File([blob], `${baseName}.${ext}`, { type: outputType });
}
