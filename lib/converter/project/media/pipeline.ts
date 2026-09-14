/**
 * Phase 14c — project-scoped media upload pipeline (opt-in).
 * Phase 14d — optional image optimization before upload (Option C preprocess).
 */

import { extensionOf } from "../fs/virtual";
import type { ProjectAsset } from "../assets/types";
import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import { resolveWordPressTargetConfig } from "../../wordpress/config";
import {
  createWordPressMediaClient,
  sanitizeMediaDiagnostic,
  validateWordPressMediaConfig,
} from "./client";
import {
  isDefaultUploadableImageExtension,
  isSvgExtension,
  mimeTypeForExtension,
  safeMediaFilename,
} from "./mime";
import {
  isMediaOptimizeEnabledFromEnv,
  optimizeAsset as defaultOptimizeAsset,
  type AssetOptimizationResult,
} from "./optimize";
import type {
  ProjectMediaClient,
  ProjectMediaOptimizationMeta,
  ProjectMediaPipelineOptions,
  ProjectMediaPipelineResult,
  ProjectMediaSummary,
  ProjectMediaUploadResult,
} from "./types";

function emptySummary(enabled: boolean): ProjectMediaSummary {
  return {
    enabled,
    uploadedCount: 0,
    reusedCount: 0,
    failedCount: 0,
    skippedCount: 0,
    uploads: [],
  };
}

function summarize(uploads: ProjectMediaUploadResult[]): ProjectMediaSummary {
  return {
    enabled: true,
    uploadedCount: uploads.filter((u) => u.status === "uploaded").length,
    reusedCount: uploads.filter((u) => u.status === "reused").length,
    failedCount: uploads.filter((u) => u.status === "failed").length,
    skippedCount: uploads.filter((u) => u.status === "skipped").length,
    uploads,
  };
}

function bytesFromVfs(
  vfs: ProjectVirtualFS,
  assetPath: string,
): Uint8Array | null {
  const file = vfs.files[assetPath];
  if (!file) return null;
  if (file.kind === "binary") return file.bytes;
  // Text assets (unusual for uploadable images) — encode UTF-8 bytes.
  return new TextEncoder().encode(file.content);
}

function toOptimizationMeta(
  result: AssetOptimizationResult,
): ProjectMediaOptimizationMeta {
  return {
    originalBytes: result.originalBytes,
    ...(result.optimizedBytes !== undefined
      ? { optimizedBytes: result.optimizedBytes }
      : {}),
    ...(result.savingsBytes !== undefined
      ? { savingsBytes: result.savingsBytes }
      : {}),
    ...(result.savingsPercent !== undefined
      ? { savingsPercent: result.savingsPercent }
      : {}),
    ...(result.optimizer ? { optimizer: result.optimizer } : {}),
    optimizationStatus: result.optimizationStatus,
    ...(result.fallbackReason
      ? { fallbackReason: result.fallbackReason }
      : {}),
  };
}

function resolveClient(
  options: ProjectMediaPipelineOptions,
):
  | { ok: true; client: ProjectMediaClient }
  | { ok: false; code: string; message: string; fatal: true } {
  if (options.client) {
    return { ok: true, client: options.client };
  }

  if (options.wordpress) {
    const valid = validateWordPressMediaConfig(options.wordpress);
    if (!valid.ok) {
      return {
        ok: false,
        fatal: true,
        code: valid.code,
        message: valid.message,
      };
    }
    return {
      ok: true,
      client: createWordPressMediaClient({ config: options.wordpress }),
    };
  }

  // Same resolver as CLI WordPress import: `.n2e-wp.local.json` (cwd → parents).
  const resolved = resolveWordPressTargetConfig({
    cwd: options.configCwd ?? process.cwd(),
  });
  if (!resolved.ok) {
    return {
      ok: false,
      fatal: true,
      code: "media-config-missing",
      message: resolved.message,
    };
  }

  return {
    ok: true,
    client: createWordPressMediaClient({ config: resolved.config }),
  };
}

/**
 * Upload unique present image assets once per project conversion session.
 * Phase 14d optimizes eligible bytes once per assetPath before upload.
 */
export async function runProjectMediaPipeline(args: {
  vfs: ProjectVirtualFS;
  assets: ProjectAsset[];
  options: ProjectMediaPipelineOptions;
}): Promise<ProjectMediaPipelineResult> {
  const diagnostics: ProjectDiagnostic[] = [];

  if (!args.options.enabled) {
    return {
      ok: true,
      summary: emptySummary(false),
      urlByAssetPath: {},
      diagnostics,
    };
  }

  const clientResult = resolveClient(args.options);
  if (!clientResult.ok) {
    diagnostics.push(
      sanitizeMediaDiagnostic({
        severity: "error",
        code: clientResult.code,
        message: clientResult.message,
      }),
    );
    return {
      ok: false,
      fatal: true,
      summary: emptySummary(true),
      urlByAssetPath: {},
      diagnostics,
    };
  }

  const client = clientResult.client;
  const optimizeEnabled =
    args.options.optimize ?? isMediaOptimizeEnabledFromEnv();
  const optimizeFn = args.options.optimizeAsset ?? defaultOptimizeAsset;
  const uploads: ProjectMediaUploadResult[] = [];
  const urlByAssetPath: Record<string, string> = {};
  const sessionUploaded = new Map<string, ProjectMediaUploadResult>();
  const sessionNonUpload = new Set<string>();
  /** Optimize-once cache: canonical path → chosen bytes + meta. */
  const sessionOptimized = new Map<string, AssetOptimizationResult>();

  // Preserve encounter order; session map dedupes uploads (second hit → reused).
  const ordered = args.assets.filter((a) => a.presence === "present");

  for (const asset of ordered) {
    const ext = asset.extension || extensionOf(asset.path);

    if (isSvgExtension(ext)) {
      if (sessionNonUpload.has(asset.path)) continue;
      sessionNonUpload.add(asset.path);
      const svgBytes = bytesFromVfs(args.vfs, asset.path);
      const skipped: ProjectMediaUploadResult = {
        assetPath: asset.path,
        status: "skipped",
        skipReason: "svg-upload-disabled",
        message: `SVG upload disabled by default: ${asset.path}`,
        optimization: {
          originalBytes: svgBytes?.byteLength ?? 0,
          optimizationStatus: "skipped",
          fallbackReason: "format-svg",
        },
      };
      uploads.push(skipped);
      diagnostics.push({
        severity: "info",
        code: "media-asset-skipped",
        message: skipped.message!,
        path: asset.path,
      });
      continue;
    }

    if (!isDefaultUploadableImageExtension(ext)) {
      if (sessionNonUpload.has(asset.path)) continue;
      sessionNonUpload.add(asset.path);
      uploads.push({
        assetPath: asset.path,
        status: "skipped",
        skipReason: "extension-not-uploadable",
        message: `Asset extension not in default upload allowlist: ${asset.path}`,
        optimization: {
          originalBytes: 0,
          optimizationStatus: "skipped",
          fallbackReason: "format-unsupported",
        },
      });
      continue;
    }

    const existing = sessionUploaded.get(asset.path);
    if (existing?.url) {
      const reused: ProjectMediaUploadResult = {
        assetPath: asset.path,
        status: "reused",
        url: existing.url,
        ...(existing.attachmentId
          ? { attachmentId: existing.attachmentId }
          : {}),
        message: `Reused WordPress media URL for ${asset.path} (same VFS path in this conversion).`,
        ...(existing.optimization
          ? { optimization: existing.optimization }
          : {}),
      };
      uploads.push(reused);
      urlByAssetPath[asset.path] = existing.url;
      continue;
    }

    if (sessionNonUpload.has(asset.path)) continue;

    const vfsBytes = bytesFromVfs(args.vfs, asset.path);
    if (!vfsBytes) {
      const failed: ProjectMediaUploadResult = {
        assetPath: asset.path,
        status: "failed",
        errorCode: "media-asset-bytes-missing",
        message: `Present asset missing bytes in VFS: ${asset.path}`,
      };
      uploads.push(failed);
      diagnostics.push(
        sanitizeMediaDiagnostic({
          severity: "warning",
          code: "media-upload-failed",
          message: failed.message!,
          path: asset.path,
        }),
      );
      continue;
    }

    // Snapshot original length before any optimize decision (VFS remains untouched).
    const originalSnapshot = vfsBytes;

    let optResult = sessionOptimized.get(asset.path);
    if (!optResult) {
      try {
        optResult = await optimizeFn({
          assetPath: asset.path,
          extension: ext,
          bytes: originalSnapshot,
          enabled: optimizeEnabled,
        });
      } catch {
        optResult = {
          bytes: originalSnapshot,
          originalBytes: originalSnapshot.byteLength,
          optimizationStatus: "fallback",
          fallbackReason: "optimize-failed",
        };
      }
      sessionOptimized.set(asset.path, optResult);

      if (
        optResult.optimizationStatus === "fallback" ||
        (optResult.optimizationStatus === "skipped" &&
          optResult.fallbackReason === "optimize-disabled")
      ) {
        diagnostics.push({
          severity: "info",
          code: "media-optimize-fallback",
          message: `Media optimize ${optResult.optimizationStatus} for ${asset.path}: ${optResult.fallbackReason ?? "n/a"}`,
          path: asset.path,
        });
      } else if (optResult.optimizationStatus === "optimized") {
        diagnostics.push({
          severity: "info",
          code: "media-optimize-applied",
          message: `Media optimize applied for ${asset.path}: ${optResult.originalBytes} → ${optResult.optimizedBytes} bytes`,
          path: asset.path,
        });
      }
    }

    const uploadBytes = optResult.bytes;
    const optimization = toOptimizationMeta(optResult);

    const result = await client.upload({
      assetPath: asset.path,
      filename: safeMediaFilename(asset.path),
      mimeType: mimeTypeForExtension(ext),
      bytes: uploadBytes,
    });

    // Never trust client to echo secrets — sanitize messages.
    const sanitized: ProjectMediaUploadResult = {
      ...result,
      optimization,
      message: result.message
        ? result.message
            .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
            .replace(
              /https?:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/gi,
              "[credential-url]",
            )
        : result.message,
    };

    if (
      sanitized.status === "failed" &&
      (sanitized.errorCode === "media-auth-failed" ||
        sanitized.errorCode === "media-unreachable")
    ) {
      uploads.push(sanitized);
      diagnostics.push(
        sanitizeMediaDiagnostic({
          severity: "error",
          code: sanitized.errorCode,
          message:
            sanitized.message ??
            `WordPress media pipeline aborted (${sanitized.errorCode}).`,
          path: asset.path,
        }),
      );
      return {
        ok: false,
        fatal: true,
        summary: summarize(uploads),
        urlByAssetPath,
        diagnostics,
      };
    }

    uploads.push(sanitized);

    if (
      (sanitized.status === "uploaded" || sanitized.status === "reused") &&
      sanitized.url
    ) {
      sessionUploaded.set(asset.path, sanitized);
      urlByAssetPath[asset.path] = sanitized.url;
      diagnostics.push({
        severity: "info",
        code: "media-asset-uploaded",
        message: `Uploaded ${asset.path} → ${sanitized.url}`,
        path: asset.path,
      });
    } else if (sanitized.status === "failed") {
      sessionNonUpload.add(asset.path);
      diagnostics.push(
        sanitizeMediaDiagnostic({
          severity: "warning",
          code: sanitized.errorCode ?? "media-upload-failed",
          message:
            sanitized.message ??
            `WordPress media upload failed for ${asset.path}.`,
          path: asset.path,
        }),
      );
    }
  }

  // Soft-skipped / missing assets that were in the input list — note not uploaded
  for (const asset of args.assets) {
    if (asset.presence === "skipped") {
      const already = uploads.some((u) => u.assetPath === asset.path);
      if (!already) {
        uploads.push({
          assetPath: asset.path,
          status: "skipped",
          skipReason: asset.skipReason ?? "asset-file-byte-limit",
          message: `Asset soft-skipped by Phase 14a; not uploaded: ${asset.path}`,
          optimization: {
            originalBytes: 0,
            optimizationStatus: "skipped",
            fallbackReason: "asset-admission-skipped",
          },
        });
      }
    }
  }

  return {
    ok: true,
    summary: summarize(uploads),
    urlByAssetPath,
    diagnostics,
  };
}
