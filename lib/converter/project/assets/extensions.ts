/**
 * Image / static asset extensions recognized for Phase 14b discovery.
 * Aligns with Phase 14a binary assets + SVG (text in VFS).
 */

export const IMAGE_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".svg",
  ".ico",
  ".bmp",
  ".avif",
]);

export function isImageAssetPath(pathOrSpecifier: string): boolean {
  const base = pathOrSpecifier.includes("/")
    ? pathOrSpecifier.slice(pathOrSpecifier.lastIndexOf("/") + 1)
    : pathOrSpecifier;
  // Strip query/hash if present in a URL-like string.
  const clean = base.split("?")[0]!.split("#")[0]!;
  const dot = clean.lastIndexOf(".");
  if (dot <= 0) return false;
  return IMAGE_ASSET_EXTENSIONS.has(clean.slice(dot).toLowerCase());
}

export function assetKindForExtension(extension: string): "image" | "other" {
  return IMAGE_ASSET_EXTENSIONS.has(extension.toLowerCase()) ? "image" : "other";
}
