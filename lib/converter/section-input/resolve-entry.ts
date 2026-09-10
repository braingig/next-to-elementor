/**
 * Detect the entry component file inside a normalized virtual file map.
 */

import { normalizeVirtualPath } from "./normalize-paths";
import type { SectionDiagnostic } from "./types";

const COMPONENT_FILE_RE = /\.(tsx|jsx|ts|js)$/i;
const ENTRY_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js"] as const;

function isComponentFile(path: string): boolean {
  return COMPONENT_FILE_RE.test(path) && !/\.d\.ts$/i.test(path);
}

function listComponentFiles(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter(isComponentFile)
    .sort((a, b) => a.localeCompare(b));
}

function firstExisting(
  files: Record<string, string>,
  candidates: string[],
): string | undefined {
  for (const c of candidates) {
    if (c in files) {
      return c;
    }
  }
  return undefined;
}

function folderNameCandidates(sectionName: string): string[] {
  const raw = sectionName.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  const base = raw.includes("/")
    ? raw.split("/").filter(Boolean).pop()
    : raw;
  if (!base || base === ".." || base === ".") {
    return [];
  }

  const out: string[] = [];
  for (const ext of ENTRY_EXTENSIONS) {
    out.push(`${base}/${base}${ext}`);
    out.push(`${base}${ext}`);
  }
  return out;
}

export type ResolveEntryResult =
  | { ok: true; entryPath: string; diagnostics: SectionDiagnostic[] }
  | {
      ok: false;
      diagnostics: SectionDiagnostic[];
      candidates?: string[];
    };

/**
 * Entry priority:
 * 1. Explicit entryPath
 * 2. Folder-name match (Section/Section.tsx or Section.tsx)
 * 3. Root index.tsx / index.jsx (then .ts / .js)
 * 4. Single component-file fallback; otherwise ambiguous / missing
 */
export function resolveEntryPath(args: {
  files: Record<string, string>;
  entryPath?: string;
  sectionName?: string;
}): ResolveEntryResult {
  const { files, entryPath, sectionName } = args;
  const diagnostics: SectionDiagnostic[] = [];
  const components = listComponentFiles(files);

  if (entryPath !== undefined) {
    const normalized = normalizeVirtualPath(entryPath);
    if (!normalized || !(normalized in files)) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: "error",
            code: "missing-entry",
            message: `Explicit entryPath not found in virtual file map: ${entryPath}`,
            path: normalized ?? entryPath,
            candidates: components,
          },
        ],
        candidates: components,
      };
    }
    if (!isComponentFile(normalized)) {
      return {
        ok: false,
        diagnostics: [
          {
            severity: "error",
            code: "invalid-entry",
            message: `entryPath is not a JS/TSX module: ${normalized}`,
            path: normalized,
          },
        ],
      };
    }
    return { ok: true, entryPath: normalized, diagnostics };
  }

  if (sectionName) {
    const match = firstExisting(files, folderNameCandidates(sectionName));
    if (match) {
      return { ok: true, entryPath: match, diagnostics };
    }
  }

  const indexMatch = firstExisting(files, [
    "index.tsx",
    "index.jsx",
    "index.ts",
    "index.js",
  ]);
  if (indexMatch) {
    return { ok: true, entryPath: indexMatch, diagnostics };
  }

  if (components.length === 1) {
    return { ok: true, entryPath: components[0]!, diagnostics };
  }

  if (components.length === 0) {
    return {
      ok: false,
      diagnostics: [
        {
          severity: "error",
          code: "missing-entry",
          message:
            "No entry component file found (expected .tsx/.jsx/.ts/.js).",
        },
      ],
    };
  }

  return {
    ok: false,
    diagnostics: [
      {
        severity: "error",
        code: "ambiguous-entry",
        message:
          "Multiple possible entry files found. Provide entryPath (or sectionName matching Section/Section.tsx).",
        candidates: components,
      },
    ],
    candidates: components,
  };
}
