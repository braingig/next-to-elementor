/**
 * Project-level ZIP / virtual-FS limits (Phase 13a + 14a).
 *
 * Phase 14a: source/text and binary-asset admission are separate.
 * Intentionally larger than SECTION_INPUT_LIMITS; kept configurable.
 */

export const PROJECT_LIMITS = {
  /** Max raw ZIP payload bytes. */
  maxZipBytes: 5 * 1024 * 1024,
  /** Max sum of uncompressed entry sizes (including ignored entries). */
  maxUncompressedBytes: 20 * 1024 * 1024,
  /** Max files kept in the ProjectVirtualFS (non-ignored, non-directory). */
  maxFiles: 500,
  /**
   * Max uncompressed bytes for a single source/text file (hard fail).
   * SVG remains under this limit (classified as text).
   */
  maxSourceFileBytes: 1 * 1024 * 1024,
  /**
   * @deprecated Alias of maxSourceFileBytes (Phase 13 name). Prefer maxSourceFileBytes.
   * Still resolved for backward-compatible overrides in tests/callers.
   */
  maxFileBytes: 1 * 1024 * 1024,
  /** Max uncompressed bytes for a single binary asset (soft-skip when exceeded). */
  maxBinaryAssetBytes: 5 * 1024 * 1024,
  /** Max sum of admitted binary asset bytes (soft-skip further assets when exceeded). */
  maxBinaryAssetsTotalBytes: 15 * 1024 * 1024,
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
  maxSourceFileBytes: number;
  /** @deprecated Alias of maxSourceFileBytes. */
  maxFileBytes: number;
  maxBinaryAssetBytes: number;
  maxBinaryAssetsTotalBytes: number;
  maxCompressionRatio: number;
  maxArchiveEntries: number;
};

export type ProjectLimitsInput = Partial<
  Omit<ProjectLimits, "maxFileBytes" | "maxSourceFileBytes">
> & {
  maxSourceFileBytes?: number;
  /** @deprecated Prefer maxSourceFileBytes; applied when maxSourceFileBytes omitted. */
  maxFileBytes?: number;
};

export function resolveProjectLimits(
  overrides: ProjectLimitsInput = {},
): ProjectLimits {
  const maxSourceFileBytes =
    overrides.maxSourceFileBytes ??
    overrides.maxFileBytes ??
    PROJECT_LIMITS.maxSourceFileBytes;

  return {
    maxZipBytes: overrides.maxZipBytes ?? PROJECT_LIMITS.maxZipBytes,
    maxUncompressedBytes:
      overrides.maxUncompressedBytes ?? PROJECT_LIMITS.maxUncompressedBytes,
    maxFiles: overrides.maxFiles ?? PROJECT_LIMITS.maxFiles,
    maxSourceFileBytes,
    maxFileBytes: maxSourceFileBytes,
    maxBinaryAssetBytes:
      overrides.maxBinaryAssetBytes ?? PROJECT_LIMITS.maxBinaryAssetBytes,
    maxBinaryAssetsTotalBytes:
      overrides.maxBinaryAssetsTotalBytes ??
      PROJECT_LIMITS.maxBinaryAssetsTotalBytes,
    maxCompressionRatio:
      overrides.maxCompressionRatio ?? PROJECT_LIMITS.maxCompressionRatio,
    maxArchiveEntries:
      overrides.maxArchiveEntries ?? PROJECT_LIMITS.maxArchiveEntries,
  };
}
