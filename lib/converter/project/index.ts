/**
 * Project layer (Phase 13a–13e).
 *
 * 13a: secure ZIP → ProjectVirtualFS
 * 13b: framework detection + route discovery
 * 13c: per-route ConversionUnit → convertSource → ProjectConversionResult
 * 13d: project ZIP APIs + UI
 * 13e: dependency capability registry + thin static adapters
 * 13f: project fixtures + integration/regression validation
 * 14a: separate source vs binary-asset ZIP admission limits
 * 14b: static asset discovery + VFS path mapping (no WP media / compression)
 *
 * Never executes uploaded code. Does not change convertSource / section-input.
 */

export {
  PROJECT_LIMITS,
  resolveProjectLimits,
  type ProjectLimits,
  type ProjectLimitsInput,
} from "./limits";

export {
  PROJECT_IGNORE_SEGMENT_NAMES,
  matchIgnoredPath,
} from "./ignore";

export {
  classifyProjectFileBytes,
  classifyProjectPathAdmission,
  isBinaryAdmissionKind,
  detectSingleRootPrefix,
  extensionOf,
  stripRootPrefix,
  type ProjectPathAdmissionKind,
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
  convertProjectAsync,
  buildConversionUnit,
  convertRouteUnit,
  collectRouteScopedCss,
  stripCssImportQuery,
  listRootCssSourceModules,
  PROJECT_ROUTE_GRAPH_LIMITS,
  type ConversionUnit,
  type LayoutCompositionMode,
  type RouteConversionResult,
  type ProjectReportSummary,
  type ProjectConversionResult,
  type ConvertProjectOptions,
  type BuildConversionUnitOptions,
  type ConvertRouteUnitOptions,
  type DocumentPageLayoutMode,
} from "./convert";

/** Project-only Elementor Free Page Layout (settings.template). */
export {
  ELEMENTOR_FREE_PAGE_TEMPLATES,
  applyDocumentPageLayout,
  documentHasFullBleedLandingEvidence,
  isAllowedElementorFreePageTemplate,
  isFullBleedLandingContainer,
  resolveProjectPageTemplate,
  type ElementorFreePageTemplate,
} from "./document-page-layout";

/** Phase 13e: dependency capability registry + thin static adapters */
export {
  DEPENDENCY_REGISTRY,
  lookupDependencyRegistry,
  packageNameFromSpecifier,
  listRegisteredPackages,
  discoverExternalImports,
  groupImportsByPackage,
  analyzeRouteDependencies,
  applyDependencyAnalysisToUnit,
  dependencyForcesRoutePartial,
  getAdapter,
  type DependencyCategory,
  type DependencyCapabilityStatus,
  type DependencyCapability,
  type ExternalImportHit,
  type RouteDependencyAnalysis,
  type RegistryEntry,
} from "./deps";

/** Phase 14b: static asset discovery + VFS mapping */
export {
  discoverRouteAssets,
  IMAGE_ASSET_EXTENSIONS,
  isImageAssetPath,
  resolveAssetSpecifierToPath,
  lookupAssetInVfs,
  type ProjectAsset,
  type ProjectAssetKind,
  type ProjectAssetReference,
  type ProjectAssetReferenceKind,
  type ProjectAssetReferenceStatus,
  type RouteAssetDiscoveryResult,
} from "./assets";

/** Phase 14c/14d: opt-in WordPress media upload + pre-convert rewrite + optimize */
export {
  runProjectMediaPipeline,
  rewriteConversionUnitMediaUrls,
  createWordPressMediaClient,
  readWordPressMediaConfigFromEnv,
  validateWordPressMediaConfig,
  WP_MEDIA_ENV,
  MEDIA_UPLOAD_EXTENSIONS,
  MEDIA_OPTIMIZE_ENV,
  MEDIA_OPTIMIZE_LIMITS,
  MEDIA_OPTIMIZE_EXTENSIONS,
  optimizeAsset,
  isMediaOptimizeEnabledFromEnv,
  resetSharpCacheForTests,
  type ProjectMediaClient,
  type ProjectMediaUploadRequest,
  type ProjectMediaUploadResult,
  type ProjectMediaOptimizationMeta,
  type ProjectMediaPipelineOptions,
  type ProjectMediaSummary,
  type ProjectMediaPipelineResult,
  type ProjectWordPressMediaConfig,
  type MediaOptimizationStatus,
  type AssetOptimizationResult,
} from "./media";
