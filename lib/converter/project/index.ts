/**
 * Project ZIP ingestion (Phase 13a).
 *
 * Secure extract → ProjectVirtualFS. No route discovery / conversion yet.
 * Never executes uploaded code. Does not change convertSource / section-input.
 */

export {
  PROJECT_LIMITS,
  resolveProjectLimits,
  type ProjectLimits,
} from "./limits";

export {
  PROJECT_IGNORE_SEGMENT_NAMES,
  matchIgnoredPath,
} from "./ignore";

export {
  classifyProjectFileBytes,
  detectSingleRootPrefix,
  extensionOf,
  stripRootPrefix,
} from "./fs/virtual";

export {
  parseZipCentralDirectory,
  isZipSymlinkEntry,
  isZipEncrypted,
  type ZipCdEntry,
} from "./zip/central-directory";

export {
  extractProjectZip,
  normalizeZipEntryPath,
} from "./zip/extract";

export {
  ProjectZipError,
  type ProjectDiagnostic,
  type ProjectDiagnosticSeverity,
  type ProjectTextFile,
  type ProjectBinaryFile,
  type ProjectVfsFile,
  type ProjectIgnoredEntry,
  type ProjectVirtualFS,
  type ProjectVirtualFsStats,
  type ExtractProjectZipOptions,
  type ExtractProjectZipResult,
  type ExtractProjectZipSuccess,
  type ExtractProjectZipFailure,
} from "./types";
