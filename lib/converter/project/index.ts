/**
 * Project layer (Phase 13a–13b).
 *
 * 13a: secure ZIP → ProjectVirtualFS
 * 13b: framework detection + route discovery (no conversion)
 *
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

export { createProjectVirtualFSFromTextFiles } from "./fs/from-text";

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

export { detectFramework } from "./manifest/detect";
export type {
  DetectionConfidence,
  ProjectFrameworkKind,
  ProjectStyleSystem,
  ProjectPackageJsonSummary,
  ProjectManifest,
  ProjectRoute,
  ProjectRouteSource,
  DiscoverRoutesResult,
  ProjectStructureAnalysis,
} from "./manifest/types";

export {
  analyzeProjectStructure,
  discoverProjectRoutes,
} from "./routes/discover";
export { discoverNextAppRoutes } from "./routes/next-app";
export { discoverNextPagesRoutes } from "./routes/next-pages";
export { discoverSpaRoutes, resolveSpaEntry } from "./routes/spa";
