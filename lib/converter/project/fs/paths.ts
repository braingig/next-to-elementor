/**
 * Shared VFS path helpers for Phase 13b (text-only, no host FS).
 */

import type { ProjectVirtualFS } from "../types";

export function listTextPaths(vfs: ProjectVirtualFS): string[] {
  return Object.keys(vfs.files)
    .filter((p) => vfs.files[p]?.kind === "text")
    .sort((a, b) => a.localeCompare(b));
}

export function readTextFile(
  vfs: ProjectVirtualFS,
  path: string,
): string | null {
  const file = vfs.files[path];
  if (!file || file.kind !== "text") return null;
  return file.content;
}

export function hasFile(vfs: ProjectVirtualFS, path: string): boolean {
  return path in vfs.files;
}

/** First existing path from candidates, in order. */
export function firstExisting(
  vfs: ProjectVirtualFS,
  candidates: string[],
): string | null {
  for (const path of candidates) {
    if (hasFile(vfs, path)) return path;
  }
  return null;
}

export function findFilesByBasename(
  vfs: ProjectVirtualFS,
  basenames: Set<string>,
): string[] {
  return listTextPaths(vfs).filter((p) => {
    const base = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
    return basenames.has(base);
  });
}

export function pathExistsPrefix(vfs: ProjectVirtualFS, prefix: string): boolean {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return listTextPaths(vfs).some(
    (p) => p === prefix || p.startsWith(normalized),
  );
}
