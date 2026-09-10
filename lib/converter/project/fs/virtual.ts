/**
 * ProjectVirtualFS builders and text/binary classification (Phase 13a).
 */

import type {
  ProjectBinaryFile,
  ProjectTextFile,
  ProjectVfsFile,
} from "./types";

/** Extensions treated as source/text when UTF-8-decodable without NUL. */
const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".json",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".md",
  ".mdx",
  ".svg",
  ".txt",
  ".yml",
  ".yaml",
  ".toml",
  ".xml",
  ".graphql",
  ".gql",
  ".env",
  ".editorconfig",
  ".gitignore",
  ".npmrc",
  ".browserslist",
]);

const TEXT_BASENAMES = new Set([
  "dockerfile",
  "makefile",
  "license",
  "licence",
  "readme",
  "changelog",
]);

export function extensionOf(path: string): string {
  const base = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

function basenameLower(path: string): string {
  const base = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
  return base.toLowerCase();
}

function hasNul(bytes: Uint8Array): boolean {
  return bytes.includes(0);
}

/**
 * Decide whether bytes should live as text source or binary asset metadata.
 * Prefer extension hints; fall back to NUL / UTF-8 checks.
 */
export function classifyProjectFileBytes(
  path: string,
  bytes: Uint8Array,
): ProjectVfsFile {
  const extension = extensionOf(path);
  const preferText =
    TEXT_EXTENSIONS.has(extension) ||
    TEXT_BASENAMES.has(basenameLower(path)) ||
    extension === "";

  if (preferText && !hasNul(bytes)) {
    try {
      const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const text: ProjectTextFile = {
        path,
        kind: "text",
        content,
        byteLength: bytes.byteLength,
      };
      return text;
    } catch {
      // Invalid UTF-8 → binary
    }
  }

  const binary: ProjectBinaryFile = {
    path,
    kind: "binary",
    bytes,
    byteLength: bytes.byteLength,
    extension,
  };
  return binary;
}

/**
 * If every path shares exactly one top-level directory and there are no
 * top-level files, return that prefix (with trailing slash). Else null.
 */
export function detectSingleRootPrefix(paths: string[]): string | null {
  if (paths.length === 0) return null;

  let root: string | null = null;
  for (const path of paths) {
    const slash = path.indexOf("/");
    if (slash <= 0) {
      return null; // top-level file → do not strip
    }
    const segment = path.slice(0, slash);
    if (root == null) {
      root = segment;
    } else if (root !== segment) {
      return null;
    }
  }
  return root ? `${root}/` : null;
}

export function stripRootPrefix(path: string, prefix: string): string {
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
