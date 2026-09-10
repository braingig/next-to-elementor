/**
 * Project ZIP ingestion types (Phase 13a).
 * Never maps ZIP paths to the host filesystem. Never executes project code.
 */

import type { ProjectLimits } from "./limits";

export type ProjectDiagnosticSeverity = "error" | "warning" | "info";

export type ProjectDiagnostic = {
  severity: ProjectDiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
};

/** Text/source content kept as UTF-8 string for later static analysis. */
export type ProjectTextFile = {
  path: string;
  kind: "text";
  content: string;
  byteLength: number;
};

/**
 * Binary (or non-UTF8) asset kept as bytes — not decoded as source text.
 * Later phases may rewrite URLs / flag WP media upload.
 */
export type ProjectBinaryFile = {
  path: string;
  kind: "binary";
  bytes: Uint8Array;
  byteLength: number;
  extension: string;
};

export type ProjectVfsFile = ProjectTextFile | ProjectBinaryFile;

export type ProjectIgnoredEntry = {
  /** Normalized path (or raw ZIP path when normalization failed safely). */
  path: string;
  reason: string;
};

export type ProjectVirtualFsStats = {
  zipBytes: number;
  uncompressedBytes: number;
  archiveEntryCount: number;
  fileCount: number;
  textFileCount: number;
  binaryFileCount: number;
  ignoredCount: number;
  /** Single top-level folder stripped from GitHub-style ZIPs, when applied. */
  rootPrefixStripped?: string;
};

/**
 * Normalized in-memory project tree produced from a ZIP.
 * Ready for later: framework detect → routes → graphs → convert.
 */
export type ProjectVirtualFS = {
  /** Kept files keyed by normalized POSIX path (no leading slash). */
  files: Record<string, ProjectVfsFile>;
  /** Paths skipped by ignore policy (or directory-only entries we record). */
  ignored: ProjectIgnoredEntry[];
  diagnostics: ProjectDiagnostic[];
  limitsApplied: ProjectLimits;
  stats: ProjectVirtualFsStats;
};

export type ExtractProjectZipOptions = {
  limits?: Partial<ProjectLimits>;
  /**
   * When true (default), strip a single shared top-level directory
   * (common for GitHub archive downloads).
   */
  stripSingleRoot?: boolean;
};

export class ProjectZipError extends Error {
  readonly code: string;
  readonly diagnostics: ProjectDiagnostic[];

  constructor(
    message: string,
    args: { code: string; diagnostics?: ProjectDiagnostic[] },
  ) {
    super(message);
    this.name = "ProjectZipError";
    this.code = args.code;
    this.diagnostics = args.diagnostics ?? [
      {
        severity: "error",
        code: args.code,
        message,
      },
    ];
  }
}

export type ExtractProjectZipSuccess = {
  ok: true;
  vfs: ProjectVirtualFS;
};

export type ExtractProjectZipFailure = {
  ok: false;
  error: ProjectZipError;
  diagnostics: ProjectDiagnostic[];
};

export type ExtractProjectZipResult =
  | ExtractProjectZipSuccess
  | ExtractProjectZipFailure;
