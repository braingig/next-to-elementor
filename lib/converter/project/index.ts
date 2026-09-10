/**
 * Project layer (Phase 13a–13c).
 *
 * 13a: secure ZIP → ProjectVirtualFS
 * 13b: framework detection + route discovery
 * 13c: per-route ConversionUnit → convertSource → ProjectConversionResult
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

/** Phase 13c: per-route ConversionUnit → convertSource → ProjectConversionResult */
export {
  convertProject,
  buildConversionUnit,
  convertRouteUnit,
  collectRouteScopedCss,
  PROJECT_ROUTE_GRAPH_LIMITS,
  type ConversionUnit,
  type LayoutCompositionMode,
  type RouteConversionResult,
  type ProjectReportSummary,
  type ProjectConversionResult,
  type ConvertProjectOptions,
  type BuildConversionUnitOptions,
  type ConvertRouteUnitOptions,
} from "./convert";
