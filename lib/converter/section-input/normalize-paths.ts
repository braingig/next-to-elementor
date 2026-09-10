/**
 * Normalize and validate virtual section paths.
 * Paths are never treated as real filesystem locations.
 */

import {
  SECTION_INPUT_LIMITS,
  type SectionDiagnostic,
  type SectionInputLimits,
  type VirtualFiles,
} from "./types";

const NUL = "\0";

/** UTF-8 byte length — works in Node and the browser (no fs / eval). */
export function utf8ByteLength(content: string): number {
  if (typeof Buffer !== "undefined") {
    return Buffer.byteLength(content, "utf8");
  }
  return new TextEncoder().encode(content).length;
}

/**
 * Normalize a single path to POSIX form relative to the virtual section root.
 * Returns null when the path is unsafe or escapes the root.
 */
export function normalizeVirtualPath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0) {
    return null;
  }
  if (raw.includes(NUL)) {
    return null;
  }

  const path = raw.replace(/\\/g, "/").trim();
  if (!path || path.includes(NUL)) {
    return null;
  }

  // Reject absolute / drive / protocol-like paths.
  if (
    path.startsWith("/") ||
    path.startsWith("//") ||
    /^[a-zA-Z]:/.test(path) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)
  ) {
    return null;
  }

  const parts = path.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") {
      continue;
    }
    if (part === "..") {
      if (out.length === 0) {
        return null; // escapes virtual root
      }
      out.pop();
      continue;
    }
    if (part.includes(":")) {
      return null;
    }
    out.push(part);
  }

  if (out.length === 0) {
    return null;
  }

  return out.join("/");
}

export type NormalizeVirtualFilesResult = {
  files: VirtualFiles;
  diagnostics: SectionDiagnostic[];
  totalBytes: number;
};

/**
 * Normalize all keys, enforce size/count limits, reject traversal and duplicates
 * that collapse to the same normalized path with differing content.
 */
export function normalizeVirtualFiles(
  input: VirtualFiles,
  limits: Partial<SectionInputLimits> = {},
): NormalizeVirtualFilesResult {
  const maxFiles = limits.maxFiles ?? SECTION_INPUT_LIMITS.maxFiles;
  const maxTotalBytes =
    limits.maxTotalBytes ?? SECTION_INPUT_LIMITS.maxTotalBytes;
  const maxFileBytes =
    limits.maxFileBytes ?? SECTION_INPUT_LIMITS.maxFileBytes;

  const diagnostics: SectionDiagnostic[] = [];
  const entries = Object.entries(input);

  if (entries.length === 0) {
    diagnostics.push({
      severity: "error",
      code: "empty-section",
      message: "Virtual file map is empty.",
    });
    return { files: {}, diagnostics, totalBytes: 0 };
  }

  if (entries.length > maxFiles) {
    diagnostics.push({
      severity: "error",
      code: "file-count-limit",
      message: `Section has ${entries.length} files; maximum is ${maxFiles}.`,
    });
    return { files: {}, diagnostics, totalBytes: 0 };
  }

  const files: VirtualFiles = {};
  let totalBytes = 0;

  for (const [rawPath, content] of entries) {
    if (typeof content !== "string") {
      diagnostics.push({
        severity: "error",
        code: "invalid-file-content",
        message: `File content must be a string: ${rawPath}`,
        path: rawPath,
      });
      continue;
    }

    const normalized = normalizeVirtualPath(rawPath);
    if (!normalized) {
      diagnostics.push({
        severity: "error",
        code: "path-traversal",
        message: `Unsafe or root-escaping virtual path rejected: ${JSON.stringify(rawPath)}`,
        path: rawPath,
      });
      continue;
    }

    const bytes = utf8ByteLength(content);
    if (bytes > maxFileBytes) {
      diagnostics.push({
        severity: "error",
        code: "file-byte-limit",
        message: `File exceeds ${maxFileBytes} byte limit: ${normalized} (${bytes} bytes)`,
        path: normalized,
      });
      continue;
    }

    if (normalized in files && files[normalized] !== content) {
      diagnostics.push({
        severity: "error",
        code: "path-collision",
        message: `Multiple distinct contents map to the same virtual path: ${normalized}`,
        path: normalized,
      });
      continue;
    }

    if (!(normalized in files)) {
      totalBytes += bytes;
      files[normalized] = content;
    }
  }

  if (totalBytes > maxTotalBytes) {
    diagnostics.push({
      severity: "error",
      code: "total-byte-limit",
      message: `Section total size ${totalBytes} bytes exceeds limit of ${maxTotalBytes}.`,
    });
    return { files: {}, diagnostics, totalBytes };
  }

  const hasError = diagnostics.some((d) => d.severity === "error");
  if (hasError) {
    return { files: {}, diagnostics, totalBytes };
  }

  return { files, diagnostics, totalBytes };
}

/**
 * Resolve a relative import specifier against a containing file's directory,
 * staying inside the virtual root.
 */
export function resolveRelativeVirtualPath(
  fromFile: string,
  specifier: string,
): string | null {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return null;
  }
  const fromDir =
    fromFile.includes("/") ? fromFile.slice(0, fromFile.lastIndexOf("/")) : "";
  const joined = fromDir ? `${fromDir}/${specifier}` : specifier;
  return normalizeVirtualPath(joined);
}
