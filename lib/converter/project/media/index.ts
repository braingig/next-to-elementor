/**
 * Phase 14c — opt-in WordPress media upload + pre-convert URL rewrite.
 * Phase 14d — safe image optimization before upload.
 */

export type {
  ProjectMediaUploadStatus,
  ProjectMediaUploadRequest,
  ProjectMediaUploadResult,
  ProjectMediaOptimizationMeta,
  ProjectMediaClient,
  ProjectWordPressMediaConfig,
  ProjectMediaPipelineOptions,
  ProjectMediaSummary,
  ProjectMediaPipelineResult,
} from "./types";

export {
  MEDIA_UPLOAD_EXTENSIONS,
  mimeTypeForExtension,
  isDefaultUploadableImageExtension,
  isSvgExtension,
  safeMediaFilename,
} from "./mime";

export {
  createWordPressMediaClient,
  validateWordPressMediaConfig,
  sanitizeMediaDiagnostic,
} from "./client";

export {
  MEDIA_OPTIMIZE_ENV,
  MEDIA_OPTIMIZE_LIMITS,
  MEDIA_OPTIMIZE_EXTENSIONS,
  optimizeAsset,
  isMediaOptimizeEnabledFromEnv,
  loadSharpSoft,
  resetSharpCacheForTests,
  type MediaOptimizationStatus,
  type AssetOptimizationResult,
  type OptimizeAssetOptions,
} from "./optimize";

export { rewriteConversionUnitMediaUrls } from "./rewrite-unit";
export { runProjectMediaPipeline } from "./pipeline";
