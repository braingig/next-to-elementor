/**
 * MIME + upload eligibility helpers for Phase 14c.
 */

/** Extensions uploaded by default (SVG excluded). */
export const MEDIA_UPLOAD_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

export function mimeTypeForExtension(extension: string): string {
  return MIME_BY_EXT[extension.toLowerCase()] ?? "application/octet-stream";
}

export function isDefaultUploadableImageExtension(extension: string): boolean {
  return MEDIA_UPLOAD_EXTENSIONS.has(extension.toLowerCase());
}

export function isSvgExtension(extension: string): boolean {
  return extension.toLowerCase() === ".svg";
}

/**
 * Sanitize a basename for upload (no path segments, no NUL).
 */
export function safeMediaFilename(path: string): string {
  const base = path.includes("/")
    ? path.slice(path.lastIndexOf("/") + 1)
    : path;
  const cleaned = base.replace(/[^\w.\-()+ ]+/g, "_").replace(/^\.+/, "");
  return cleaned || "asset.bin";
}
