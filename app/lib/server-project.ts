/**
 * Shared handlers for POST /api/project/analyze and /api/project/convert.
 * Multipart ZIP → existing project layer. Never executes uploaded code.
 */

import {
  PROJECT_LIMITS,
  analyzeProjectStructure,
  convertProject,
  convertProjectAsync,
  extractProjectZip,
  type ProjectConversionResult,
  type ProjectDiagnostic,
  type ProjectStructureAnalysis,
  type ProjectVirtualFS,
  type RouteConversionResult,
  type ProjectMediaUploadResult,
} from "@/lib/converter";
import type {
  ProjectAnalyzeResponse,
  ProjectApiError,
  ProjectConvertResponse,
  ProjectConvertSuccess,
  ProjectUnitSummary,
} from "@/app/lib/project-api-types";

export type {
  ProjectAnalyzeResponse,
  ProjectApiError,
  ProjectConvertResponse,
  ProjectConvertSuccess,
  ProjectRouteApiResult,
  ProjectUnitSummary,
  ProjectAnalyzeSuccess,
} from "@/app/lib/project-api-types";

/** API body size allowance: ZIP bytes + multipart overhead. */
export const MAX_PROJECT_UPLOAD_BYTES = PROJECT_LIMITS.maxZipBytes + 256 * 1024;

export type ProjectHandlerResult<T> = {
  status: number;
  payload: T;
};

function sanitizeMessage(message: string): string {
  return message
    .replace(/\/(?:Users|home|var|private|tmp|opt)\/[^\s"'`]+/gi, "[path]")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]");
}

function sanitizeDiagnostics(
  diagnostics: ProjectDiagnostic[],
): ProjectDiagnostic[] {
  return diagnostics.map((d) => ({
    ...d,
    message: sanitizeMessage(d.message),
  }));
}

function errorPayload(
  status: number,
  code: string,
  error: string,
  diagnostics?: ProjectDiagnostic[],
): ProjectHandlerResult<ProjectApiError> {
  return {
    status,
    payload: {
      ok: false,
      error: sanitizeMessage(error),
      code,
      ...(diagnostics && diagnostics.length > 0
        ? { diagnostics: sanitizeDiagnostics(diagnostics) }
        : {}),
    },
  };
}

function toUnitSummary(
  unit: NonNullable<RouteConversionResult["unit"]>,
): ProjectUnitSummary {
  return {
    entryFile: unit.entryFile,
    sourcePath: unit.sourcePath,
    layoutChain: unit.layoutChain,
    layoutMode: unit.layoutMode,
    cssPaths: unit.cssPaths,
    moduleCount: Object.keys(unit.moduleSources).length,
  };
}

export function toApiProjectResult(
  result: ProjectConversionResult,
): ProjectConvertSuccess["result"] {
  return {
    outcome: result.outcome,
    elementorTarget: result.elementorTarget,
    catalogVersion: result.catalogVersion,
    irVersion: result.irVersion,
    manifest: {
      ...result.manifest,
      diagnostics: sanitizeDiagnostics(result.manifest.diagnostics),
    },
    routes: result.routes.map((r) => ({
      route: r.route,
      outcome: r.outcome,
      conversion: r.conversion,
      diagnostics: sanitizeDiagnostics(r.diagnostics),
      unit: r.unit ? toUnitSummary(r.unit) : null,
      ...(r.dependencies
        ? {
            dependencies: r.dependencies.map((d) => ({
              ...d,
              diagnostics: sanitizeDiagnostics(d.diagnostics),
              importedFrom: d.importedFrom.map((p) => sanitizeMessage(p)),
            })),
          }
        : {}),
    })),
    projectReport: {
      ...result.projectReport,
      message: sanitizeMessage(result.projectReport.message),
    },
    diagnostics: sanitizeDiagnostics(result.diagnostics),
    ...(result.media
      ? {
          media: {
            enabled: result.media.enabled,
            uploadedCount: result.media.uploadedCount,
            reusedCount: result.media.reusedCount,
            failedCount: result.media.failedCount,
            skippedCount: result.media.skippedCount,
            uploads: result.media.uploads.map((u: ProjectMediaUploadResult) => ({
              assetPath: u.assetPath,
              status: u.status,
              ...(u.url ? { url: u.url } : {}),
              ...(u.attachmentId ? { attachmentId: u.attachmentId } : {}),
              ...(u.skipReason ? { skipReason: u.skipReason } : {}),
              ...(u.errorCode ? { errorCode: u.errorCode } : {}),
              ...(u.message
                ? { message: sanitizeMessage(u.message) }
                : {}),
              ...(u.optimization
                ? {
                    optimization: {
                      originalBytes: u.optimization.originalBytes,
                      ...(u.optimization.optimizedBytes !== undefined
                        ? { optimizedBytes: u.optimization.optimizedBytes }
                        : {}),
                      ...(u.optimization.savingsBytes !== undefined
                        ? { savingsBytes: u.optimization.savingsBytes }
                        : {}),
                      ...(u.optimization.savingsPercent !== undefined
                        ? { savingsPercent: u.optimization.savingsPercent }
                        : {}),
                      ...(u.optimization.optimizer
                        ? { optimizer: u.optimization.optimizer }
                        : {}),
                      optimizationStatus: u.optimization.optimizationStatus,
                      ...(u.optimization.fallbackReason
                        ? { fallbackReason: u.optimization.fallbackReason }
                        : {}),
                    },
                  }
                : {}),
            })),
          },
        }
      : {}),
  };
}

/**
 * Read ZIP bytes from multipart FormData (`zip` or `file` field).
 */
export async function readZipFromFormData(
  formData: FormData,
): Promise<
  | { ok: true; bytes: Uint8Array; filename: string }
  | { ok: false; status: number; payload: ProjectApiError }
> {
  const entry = formData.get("zip") ?? formData.get("file");
  if (entry == null) {
    return {
      ok: false,
      ...errorPayload(
        400,
        "missing-zip",
        'Missing ZIP file. Use form field "zip".',
      ),
    };
  }

  if (typeof entry === "string") {
    return {
      ok: false,
      ...errorPayload(
        400,
        "invalid-zip-field",
        "ZIP field must be a file upload, not a string.",
      ),
    };
  }

  const file = entry as File;
  const filename = file.name || "project.zip";
  const lower = filename.toLowerCase();
  const type = (file.type || "").toLowerCase();

  if (
    !lower.endsWith(".zip") &&
    type !== "application/zip" &&
    type !== "application/x-zip-compressed" &&
    type !== "application/octet-stream"
  ) {
    if (!lower.endsWith(".zip")) {
      return {
        ok: false,
        ...errorPayload(
          400,
          "invalid-zip-type",
          "Uploaded file must be a .zip archive.",
        ),
      };
    }
  }

  if (file.size > PROJECT_LIMITS.maxZipBytes) {
    return {
      ok: false,
      ...errorPayload(
        413,
        "zip-size-limit",
        `ZIP size ${file.size} bytes exceeds limit of ${PROJECT_LIMITS.maxZipBytes}.`,
      ),
    };
  }

  if (file.size === 0) {
    return {
      ok: false,
      ...errorPayload(400, "empty-zip", "ZIP file is empty."),
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return {
      ok: false,
      ...errorPayload(400, "zip-read-error", "Unable to read uploaded ZIP file."),
    };
  }

  if (bytes.byteLength > PROJECT_LIMITS.maxZipBytes) {
    return {
      ok: false,
      ...errorPayload(
        413,
        "zip-size-limit",
        `ZIP size ${bytes.byteLength} bytes exceeds limit of ${PROJECT_LIMITS.maxZipBytes}.`,
      ),
    };
  }

  return { ok: true, bytes, filename };
}

type ExtractOk = { ok: true; vfs: ProjectVirtualFS };

function extractOrError(
  bytes: Uint8Array,
): ExtractOk | ProjectHandlerResult<ProjectApiError> {
  const extracted = extractProjectZip(bytes);
  if (!extracted.ok) {
    const status =
      extracted.error.code === "zip-size-limit" ||
      extracted.error.code === "uncompressed-size-limit" ||
      extracted.error.code === "file-count-limit" ||
      extracted.error.code === "file-byte-limit" ||
      extracted.error.code === "compression-ratio-limit" ||
      extracted.error.code === "archive-entry-limit"
        ? 413
        : 400;
    return errorPayload(
      status,
      extracted.error.code,
      extracted.error.message,
      extracted.diagnostics,
    );
  }
  return { ok: true, vfs: extracted.vfs };
}

function isExtractOk(
  value: ExtractOk | ProjectHandlerResult<ProjectApiError>,
): value is ExtractOk {
  return "ok" in value && value.ok === true && "vfs" in value;
}

/**
 * Analyze a project ZIP (in-memory). Used by the route handler and unit tests.
 */
export function runProjectAnalyze(
  zipBytes: Uint8Array,
): ProjectHandlerResult<ProjectAnalyzeResponse> {
  const extracted = extractOrError(zipBytes);
  if (!isExtractOk(extracted)) {
    return extracted;
  }

  try {
    const analysis: ProjectStructureAnalysis = analyzeProjectStructure(
      extracted.vfs,
    );
    return {
      status: 200,
      payload: {
        ok: true,
        analysis: {
          manifest: {
            ...analysis.manifest,
            diagnostics: sanitizeDiagnostics(analysis.manifest.diagnostics),
          },
          routes: analysis.routes,
          diagnostics: sanitizeDiagnostics(analysis.diagnostics),
        },
        vfsStats: extracted.vfs.stats,
      },
    };
  } catch (error) {
    return errorPayload(
      500,
      "analyze-error",
      error instanceof Error
        ? error.message
        : "Project analysis failed unexpectedly.",
    );
  }
}

/**
 * Convert a project ZIP (in-memory). Used by the route handler and unit tests.
 * When `mediaEnabled` is true, uses convertProjectAsync with server WP env config.
 */
export async function runProjectConvert(
  zipBytes: Uint8Array,
  options: { mediaEnabled?: boolean } = {},
): Promise<ProjectHandlerResult<ProjectConvertResponse>> {
  const extracted = extractOrError(zipBytes);
  if (!isExtractOk(extracted)) {
    return extracted;
  }

  try {
    const result = options.mediaEnabled
      ? await convertProjectAsync(extracted.vfs, {
          media: { enabled: true },
        })
      : convertProject(extracted.vfs);
    return {
      status: 200,
      payload: {
        ok: true,
        result: toApiProjectResult(result),
      },
    };
  } catch (error) {
    return errorPayload(
      500,
      "convert-error",
      error instanceof Error
        ? error.message
        : "Project conversion failed unexpectedly.",
    );
  }
}

function parseMediaOptIn(formData: FormData): boolean {
  const raw = formData.get("media");
  if (raw == null) return false;
  if (typeof raw !== "string") return false;
  const v = raw.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export async function handleProjectMultipart(
  request: Request,
  mode: "analyze" | "convert",
): Promise<Response> {
  const contentLength = request.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (Number.isFinite(len) && len > MAX_PROJECT_UPLOAD_BYTES) {
      return Response.json(
        errorPayload(
          413,
          "upload-size-limit",
          `Upload exceeds ${MAX_PROJECT_UPLOAD_BYTES} byte limit.`,
        ).payload,
        { status: 413 },
      );
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      errorPayload(
        400,
        "invalid-multipart",
        "Request must be multipart/form-data with a ZIP file.",
      ).payload,
      { status: 400 },
    );
  }

  const zip = await readZipFromFormData(formData);
  if (!zip.ok) {
    return Response.json(zip.payload, { status: zip.status });
  }

  if (mode === "analyze") {
    const result = runProjectAnalyze(zip.bytes);
    return Response.json(result.payload, { status: result.status });
  }

  const mediaEnabled = parseMediaOptIn(formData);
  const result = await runProjectConvert(zip.bytes, { mediaEnabled });
  return Response.json(result.payload, { status: result.status });
}
