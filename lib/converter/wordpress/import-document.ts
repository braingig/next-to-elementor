/**
 * Import a classic Elementor document (version 0.4) into a target WordPress
 * site via authenticated REST.
 *
 * Always creates a NEW `elementor_library` template (same class of document as
 * Elementor → Templates → Import). Never updates an existing post; never
 * requires a target post ID.
 *
 * Uses Application Password Basic auth (same config as Phase 14 media).
 */

import type { ElementorDocument } from "../rules/native/types";
import {
  basicAuthHeader,
  wordpressRestUrl,
  type WordPressTargetConfig,
} from "./config";

export type ImportElementorDocumentOptions = {
  config: WordPressTargetConfig;
  document: ElementorDocument;
  /** Optional title for the new library template. */
  title?: string;
  fetchImpl?: typeof fetch;
};

export type ImportElementorDocumentResult = {
  ok: true;
  postId: number;
  permalink: string;
  /** `post.php?post={id}&action=elementor` for the newly created template. */
  editUrl: string;
  title: string;
  mode: "created";
  postType: "elementor_library";
};

export type ImportElementorDocumentFailure = {
  ok: false;
  code: string;
  message: string;
  httpStatus?: number;
};

/** Matches Elementor Template Library “page” templates (UI JSON import). */
const LIBRARY_TEMPLATE_TYPE = "page" as const;
const LIBRARY_COLLECTION = "elementor_library" as const;

const ALLOWED_TEMPLATES = new Set([
  "default",
  "elementor_canvas",
  "elementor_header_footer",
  "elementor_theme",
]);

function sanitize(message: string): string {
  return message
    .replace(/Basic\s+[A-Za-z0-9+/=]+/gi, "Basic [redacted]")
    .replace(
      /(application[\s_-]*password|app[\s_-]*password|authorization)\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    );
}

function resolveTemplate(document: ElementorDocument): string {
  const raw = document.settings?.template;
  if (typeof raw === "string" && ALLOWED_TEMPLATES.has(raw)) return raw;
  return "elementor_header_footer";
}

function editUrlFor(config: WordPressTargetConfig, postId: number): string {
  return `${config.baseUrl}/wp-admin/post.php?post=${postId}&action=elementor`;
}

function parsePostRecord(body: unknown): {
  postId: number;
  permalink?: string;
  title?: string;
  type?: string;
} | null {
  const record = body as {
    id?: unknown;
    link?: unknown;
    type?: unknown;
    title?: { rendered?: unknown };
  };
  const postId = typeof record.id === "number" ? record.id : Number(record.id);
  if (!Number.isFinite(postId) || postId <= 0) return null;
  return {
    postId,
    ...(typeof record.link === "string" && record.link
      ? { permalink: record.link }
      : {}),
    ...(typeof record.title?.rendered === "string"
      ? { title: record.title.rendered }
      : {}),
    ...(typeof record.type === "string" ? { type: record.type } : {}),
  };
}

async function fetchJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; text: string }
> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    const raw =
      error instanceof Error ? error.message : "WordPress unreachable.";
    return { ok: false, status: 0, text: raw };
  }
  if (!response.ok) {
    let text = `HTTP ${response.status}`;
    try {
      const body = await response.text();
      if (body) text = `${text}: ${body.slice(0, 300)}`;
    } catch {
      /* ignore */
    }
    return { ok: false, status: response.status, text };
  }
  try {
    return { ok: true, status: response.status, body: await response.json() };
  } catch {
    return {
      ok: false,
      status: response.status,
      text: "WordPress response was not JSON.",
    };
  }
}

function elementorLibraryMeta(args: {
  elementsJson: string;
  template: string;
}): Record<string, unknown> {
  return {
    _elementor_edit_mode: "builder",
    _elementor_template_type: LIBRARY_TEMPLATE_TYPE,
    _elementor_data: args.elementsJson,
    _elementor_page_settings: {
      template: args.template,
    },
  };
}

/**
 * Create a new Elementor Library template whose `_elementor_data` is exactly
 * `JSON.stringify(document.content)`. "Edit with Elementor" for the returned
 * `editUrl` opens this same post ID.
 */
export async function importElementorDocument(
  options: ImportElementorDocumentOptions,
): Promise<ImportElementorDocumentResult | ImportElementorDocumentFailure> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const title =
    options.title?.trim() ||
    options.document.title?.trim() ||
    "n2e-import";
  const template = resolveTemplate(options.document);
  const elementsJson = JSON.stringify(options.document.content ?? []);
  const endpoint = wordpressRestUrl(
    options.config,
    `/wp/v2/${LIBRARY_COLLECTION}`,
  );
  const auth = basicAuthHeader(options.config);

  const result = await fetchJson(fetchImpl, endpoint, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title,
      status: "publish",
      meta: elementorLibraryMeta({ elementsJson, template }),
    }),
  });

  if (!result.ok) {
    if (result.status === 0) {
      return {
        ok: false,
        code: "wp-import-unreachable",
        message: sanitize(
          `WordPress Elementor library import unreachable: ${result.text}`,
        ),
      };
    }
    if (result.status === 401 || result.status === 403) {
      return {
        ok: false,
        code: "wp-import-auth-failed",
        message: sanitize(
          `WordPress Elementor library import authentication failed (HTTP ${result.status}).`,
        ),
        httpStatus: result.status,
      };
    }
    return {
      ok: false,
      code: "wp-import-failed",
      message: sanitize(
        `WordPress Elementor library import failed: ${result.text}`,
      ),
      httpStatus: result.status,
    };
  }

  const parsed = parsePostRecord(result.body);
  if (!parsed) {
    return {
      ok: false,
      code: "wp-import-invalid-response",
      message: "WordPress Elementor library import response missing post id.",
    };
  }

  const record = result.body as { meta?: Record<string, unknown> };
  const storedData = record.meta?._elementor_data;
  if (typeof storedData === "string" && storedData !== elementsJson) {
    // REST may echo escaped JSON; accept semantic equality.
    try {
      if (JSON.stringify(JSON.parse(storedData)) !== JSON.stringify(JSON.parse(elementsJson))) {
        return {
          ok: false,
          code: "wp-import-data-mismatch",
          message:
            "WordPress stored _elementor_data does not match the imported document content.",
        };
      }
    } catch {
      return {
        ok: false,
        code: "wp-import-data-mismatch",
        message:
          "WordPress stored _elementor_data does not match the imported document content.",
      };
    }
  }

  return {
    ok: true,
    mode: "created",
    postId: parsed.postId,
    permalink:
      parsed.permalink ?? `${options.config.baseUrl}/?p=${parsed.postId}`,
    editUrl: editUrlFor(options.config, parsed.postId),
    title: parsed.title ?? title,
    postType: LIBRARY_COLLECTION,
  };
}
