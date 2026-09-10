/**
 * Project-level ZIP / virtual-FS limits (Phase 13a).
 * Intentionally larger than SECTION_INPUT_LIMITS; kept configurable.
 */

export const PROJECT_LIMITS = {
  /** Max raw ZIP payload bytes. */
  maxZipBytes: 5 * 1024 * 1024,
  /** Max sum of uncompressed entry sizes (including ignored entries). */
  maxUncompressedBytes: 20 * 1024 * 1024,
  /** Max files kept in the ProjectVirtualFS (non-ignored, non-directory). */
  maxFiles: 500,
  /** Max uncompressed bytes for a single kept file. */
  maxFileBytes: 1 * 1024 * 1024,
  /**
   * Max uncompressed/compressed ratio across the archive.
   * Uses ZIP byte length as compressed size when CD totals are incomplete.
   */
  maxCompressionRatio: 50,
  /**
   * Max central-directory entries scanned (files + dirs + ignored).
   * Protects against huge ignored trees (e.g. node_modules bombs).
   */
  maxArchiveEntries: 5000,
} as const;

export type ProjectLimits = {
  maxZipBytes: number;
  maxUncompressedBytes: number;
  maxFiles: number;
  maxFileBytes: number;
  maxCompressionRatio: number;
  maxArchiveEntries: number;
};

export function resolveProjectLimits(
  overrides: Partial<ProjectLimits> = {},
): ProjectLimits {
  return {
    maxZipBytes: overrides.maxZipBytes ?? PROJECT_LIMITS.maxZipBytes,
    maxUncompressedBytes:
      overrides.maxUncompressedBytes ?? PROJECT_LIMITS.maxUncompressedBytes,
    maxFiles: overrides.maxFiles ?? PROJECT_LIMITS.maxFiles,
    maxFileBytes: overrides.maxFileBytes ?? PROJECT_LIMITS.maxFileBytes,
    maxCompressionRatio:
      overrides.maxCompressionRatio ?? PROJECT_LIMITS.maxCompressionRatio,
    maxArchiveEntries:
      overrides.maxArchiveEntries ?? PROJECT_LIMITS.maxArchiveEntries,
  };
}
