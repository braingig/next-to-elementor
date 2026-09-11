/**
 * Phase 14c/14d — WordPress media upload types (project-layer only).
 * No convertSource coupling. Credentials never appear in these types' outputs.
 */

import type { ProjectDiagnostic } from "../types";
import type {
  AssetOptimizationResult,
  MediaOptimizationStatus,
} from "./optimize";

export type ProjectMediaUploadStatus =
  | "uploaded"
  | "reused"
  | "failed"
  | "skipped";

export type ProjectMediaUploadRequest = {
  /** Canonical ProjectVirtualFS path. */
  assetPath: string;
  /** Safe basename for Content-Disposition / multipart. */
  filename: string;
  mimeType: string;
  /**
   * Bytes to upload (immutable VFS original, or 14d-optimized copy).
   * The media client never decodes/transforms these bytes.
   */
  bytes: Uint8Array;
  alt?: string;
};

/** Phase 14d observability attached to upload/reuse results. */
export type ProjectMediaOptimizationMeta = {
  originalBytes: number;
  optimizedBytes?: number;
  savingsBytes?: number;
  savingsPercent?: number;
  optimizer?: string;
  optimizationStatus: MediaOptimizationStatus;
  fallbackReason?: string;
};

export type ProjectMediaUploadResult = {
  assetPath: string;
  status: ProjectMediaUploadStatus;
  /** Public HTTPS/HTTP media URL when uploaded/reused. */
  url?: string;
  /** Optional WP attachment id (Elementor Free output may keep id empty). */
  attachmentId?: string;
  skipReason?: string;
  errorCode?: string;
  message?: string;
  /** Phase 14d: optimization decision for this asset (session reuse copies it). */
  optimization?: ProjectMediaOptimizationMeta;
};

export type ProjectMediaClient = {
  upload(
    request: ProjectMediaUploadRequest,
  ): Promise<ProjectMediaUploadResult>;
};

/** Server-side WordPress Application Password config (never from client ZIP). */
export type ProjectWordPressMediaConfig = {
  baseUrl: string;
  username: string;
  applicationPassword: string;
};

export type ProjectMediaPipelineOptions = {
  enabled: boolean;
  /**
   * Injected client (tests). When omitted and enabled, WordPress REST client
   * is built from `wordpress` config or environment.
   */
  client?: ProjectMediaClient;
  /** Explicit config; otherwise read from process.env (server only). */
  wordpress?: ProjectWordPressMediaConfig;
  /**
   * Phase 14d: optimize images before upload when media is enabled.
   * Default: from `N2E_MEDIA_OPTIMIZE` (enabled unless 0/false/off/no).
   */
  optimize?: boolean;
  /**
   * Injectable optimizer (tests). Default: `optimizeAsset`.
   */
  optimizeAsset?: (
    options: import("./optimize").OptimizeAssetOptions,
  ) => Promise<AssetOptimizationResult>;
};

export type ProjectMediaSummary = {
  enabled: boolean;
  uploadedCount: number;
  reusedCount: number;
  failedCount: number;
  skippedCount: number;
  uploads: ProjectMediaUploadResult[];
};

export type ProjectMediaPipelineResult = {
  ok: boolean;
  /** Fatal pipeline errors (config/auth/unreachable) stop conversion. */
  fatal?: boolean;
  summary: ProjectMediaSummary;
  /** assetPath → successful upload/reuse with url */
  urlByAssetPath: Record<string, string>;
  diagnostics: ProjectDiagnostic[];
};

/** Env vars for server-side WP Application Passwords. */
export const WP_MEDIA_ENV = {
  baseUrl: "N2E_WP_BASE_URL",
  username: "N2E_WP_USER",
  applicationPassword: "N2E_WP_APP_PASSWORD",
} as const;
