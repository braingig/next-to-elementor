/**
 * WordPress REST media client + env config (server-side only).
 * Never logs credentials or Authorization headers.
 */

import type { ProjectDiagnostic } from "../types";
import type {
  ProjectMediaClient,
  ProjectMediaUploadRequest,
  ProjectMediaUploadResult,
  ProjectWordPressMediaConfig,
} from "./types";
import { WP_MEDIA_ENV } from "./types";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function sanitizeMediaMessage(message: string): string {
  return message
    .replace(/\/(?:Users|home|var|private|tmp|opt)\/[^\s"'`]+/gi, "[path]")
    .replace(/[A-Za-z]:\\[^\s"'`]+/g, "[path]")
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
    .replace(
      /(application[\s_-]*password|app[\s_-]*password|authorization)\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .replace(
      /https?:\/\/[^\s"'`]+:[^\s"'`]+@[^\s"'`]+/gi,
      "[credential-url]",
    );
}

export function sanitizeMediaDiagnostic(
  d: ProjectDiagnostic,
): ProjectDiagnostic {
  return { ...d, message: sanitizeMediaMessage(d.message) };
}

export function readWordPressMediaConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProjectWordPressMediaConfig | null {
  const baseUrl = env[WP_MEDIA_ENV.baseUrl]?.trim();
  const username = env[WP_MEDIA_ENV.username]?.trim();
  const applicationPassword = env[WP_MEDIA_ENV.applicationPassword]?.trim();
  if (!baseUrl || !username || !applicationPassword) return null;
  return { baseUrl, username, applicationPassword };
}

export function validateWordPressMediaConfig(
  config: ProjectWordPressMediaConfig,
): { ok: true } | { ok: false; code: string; message: string } {
  try {
    const u = new URL(config.baseUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return {
        ok: false,
        code: "media-config-invalid",
        message: "N2E_WP_BASE_URL must be an http(s) URL.",
      };
    }
  } catch {
    return {
      ok: false,
      code: "media-config-invalid",
      message: "N2E_WP_BASE_URL is not a valid URL.",
    };
  }
  if (!config.username || !config.applicationPassword) {
    return {
      ok: false,
      code: "media-config-missing",
      message:
        "WordPress media requires N2E_WP_BASE_URL, N2E_WP_USER, and N2E_WP_APP_PASSWORD.",
    };
  }
  return { ok: true };
}

function basicAuthHeader(username: string, applicationPassword: string): string {
  const token = Buffer.from(
    `${username}:${applicationPassword}`,
    "utf8",
  ).toString("base64");
  return `Basic ${token}`;
}

function isPublicHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export type CreateWordPressMediaClientOptions = {
  config: ProjectWordPressMediaConfig;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
};

/**
 * WordPress Application Password client for POST /wp-json/wp/v2/media.
 */
export function createWordPressMediaClient(
  options: CreateWordPressMediaClientOptions,
): ProjectMediaClient {
  const { config } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${stripTrailingSlash(config.baseUrl)}/wp-json/wp/v2/media`;

  return {
    async upload(
      request: ProjectMediaUploadRequest,
    ): Promise<ProjectMediaUploadResult> {
      const auth = basicAuthHeader(
        config.username,
        config.applicationPassword,
      );

      const form = new FormData();
      // Copy into a fresh ArrayBuffer so File/Blob accepts the view (SharedArrayBuffer-safe).
      const copy = new Uint8Array(request.bytes.byteLength);
      copy.set(request.bytes);
      const blob = new Blob([copy], { type: request.mimeType });
      form.append(
        "file",
        blob,
        request.filename,
      );
      if (request.alt) {
        form.append("alt_text", request.alt);
      }

      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: auth,
            // Let runtime set multipart boundary; do not set Content-Type manually.
          },
          body: form,
        });
      } catch (error) {
        const raw =
          error instanceof Error ? error.message : "WordPress unreachable.";
        return {
          assetPath: request.assetPath,
          status: "failed",
          errorCode: "media-unreachable",
          message: sanitizeMediaMessage(
            `WordPress media endpoint unreachable: ${raw}`,
          ),
        };
      }

      if (response.status === 401 || response.status === 403) {
        return {
          assetPath: request.assetPath,
          status: "failed",
          errorCode: "media-auth-failed",
          message: sanitizeMediaMessage(
            `WordPress media authentication failed (HTTP ${response.status}).`,
          ),
        };
      }

      if (!response.ok) {
        let detail = `HTTP ${response.status}`;
        try {
          const text = await response.text();
          if (text) detail = `${detail}: ${text.slice(0, 200)}`;
        } catch {
          /* ignore */
        }
        return {
          assetPath: request.assetPath,
          status: "failed",
          errorCode: "media-upload-failed",
          message: sanitizeMediaMessage(
            `WordPress media upload failed for ${request.assetPath}: ${detail}`,
          ),
        };
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return {
          assetPath: request.assetPath,
          status: "failed",
          errorCode: "media-upload-invalid-response",
          message: sanitizeMediaMessage(
            `WordPress media response was not JSON for ${request.assetPath}.`,
          ),
        };
      }

      const record = body as {
        source_url?: unknown;
        guid?: { rendered?: unknown };
        id?: unknown;
      };
      const urlCandidate =
        (typeof record.source_url === "string" && record.source_url) ||
        (typeof record.guid?.rendered === "string" && record.guid.rendered) ||
        null;

      if (!isPublicHttpUrl(urlCandidate)) {
        return {
          assetPath: request.assetPath,
          status: "failed",
          errorCode: "media-upload-invalid-response",
          message: sanitizeMediaMessage(
            `WordPress media response missing a public http(s) URL for ${request.assetPath}.`,
          ),
        };
      }

      const attachmentId =
        typeof record.id === "number" || typeof record.id === "string"
          ? String(record.id)
          : undefined;

      return {
        assetPath: request.assetPath,
        status: "uploaded",
        url: urlCandidate,
        ...(attachmentId ? { attachmentId } : {}),
        message: `Uploaded ${request.assetPath} to WordPress media.`,
      };
    },
  };
}
