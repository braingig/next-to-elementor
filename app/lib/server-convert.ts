/**
 * Shared convert handler for POST /api/convert.
 * Single-file → convertSource; folder → resolveSectionInput → convertSource.
 * Never executes user source. Never exposes knownComponentSources on the wire.
 */

import { z } from "zod";
import {
  convertSource,
  resolveSectionInput,
  SECTION_INPUT_LIMITS,
  type ConversionResult,
  type ReactSourceLanguage,
  type SectionDiagnostic,
} from "@/lib/converter";

/** Section-sized inputs only — protects the sync conversion path. */
export const MAX_CONVERT_BODY_BYTES = 512 * 1024;

const LanguageSchema = z.enum(["tsx", "jsx", "auto"]);

export const ConvertSingleFileBodySchema = z
  .object({
    source: z.string().min(1, "source is required"),
    css: z.string().optional(),
    language: LanguageSchema.optional(),
    title: z.string().min(1).max(200).optional(),
  })
  .strict();

export const ConvertFolderBodySchema = z
  .object({
    files: z
      .record(z.string(), z.string())
      .refine((files) => Object.keys(files).length > 0, {
        message: "files must not be empty",
      }),
    entryPath: z.string().min(1).optional(),
    componentName: z.string().min(1).optional(),
    sectionName: z.string().min(1).optional(),
    css: z.string().optional(),
    language: LanguageSchema.optional(),
    title: z.string().min(1).max(200).optional(),
  })
  .strict();

/** @deprecated Prefer ConvertSingleFileBodySchema — kept for existing imports. */
export const ConvertRequestBodySchema = ConvertSingleFileBodySchema;

export type ConvertSingleFileBody = z.infer<typeof ConvertSingleFileBodySchema>;
export type ConvertFolderBody = z.infer<typeof ConvertFolderBodySchema>;
export type ConvertRequestBody = ConvertSingleFileBody | ConvertFolderBody;

export type ConvertApiSuccess = {
  ok: true;
  result: ConversionResult;
};

export type ConvertApiError = {
  ok: false;
  error: string;
  code?: string;
  details?: unknown;
  diagnostics?: SectionDiagnostic[];
  candidates?: string[];
};

export type ConvertApiResponse = ConvertApiSuccess | ConvertApiError;

const COMPONENT_FILE_RE = /\.(tsx|jsx|ts|js)$/i;
const CSS_FILE_RE = /\.css$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptySource(body: Record<string, unknown>): boolean {
  return typeof body.source === "string" && body.source.length > 0;
}

function hasFilesMap(body: Record<string, unknown>): boolean {
  return isPlainObject(body.files);
}

function pickComponentFiles(
  files: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (COMPONENT_FILE_RE.test(path) && !/\.d\.ts$/i.test(path)) {
      out[path] = content;
    }
  }
  return out;
}

/** Deterministic CSS concatenation from the virtual map (not import-graph collection). */
export function collectCssFromVirtualFiles(
  files: Record<string, string>,
): string {
  return Object.keys(files)
    .filter((p) => CSS_FILE_RE.test(p))
    .sort((a, b) => a.localeCompare(b))
    .map((p) => files[p] ?? "")
    .filter((c) => c.trim().length > 0)
    .join("\n\n");
}

function folderResolveError(
  message: string,
  args: {
    code: string;
    diagnostics?: SectionDiagnostic[];
    candidates?: string[];
    details?: unknown;
  },
): { status: number; payload: ConvertApiError } {
  return {
    status: 400,
    payload: {
      ok: false,
      error: message,
      code: args.code,
      ...(args.diagnostics ? { diagnostics: args.diagnostics } : {}),
      ...(args.candidates ? { candidates: args.candidates } : {}),
      ...(args.details !== undefined ? { details: args.details } : {}),
    },
  };
}

function runSingleFileConvert(
  body: ConvertSingleFileBody,
): { status: number; payload: ConvertApiResponse } {
  const result = convertSource({
    source: body.source,
    css: body.css ?? "",
    language: (body.language ?? "auto") as ReactSourceLanguage,
    title: body.title ?? "converted-section",
    catalogTarget: "4.2.4",
  });

  return {
    status: 200,
    payload: {
      ok: true,
      result,
    },
  };
}

function runFolderConvert(
  body: ConvertFolderBody,
): { status: number; payload: ConvertApiResponse } {
  const fileCount = Object.keys(body.files).length;
  if (fileCount > SECTION_INPUT_LIMITS.maxFiles) {
    return folderResolveError(
      `Section has ${fileCount} files; maximum is ${SECTION_INPUT_LIMITS.maxFiles}.`,
      { code: "file-count-limit" },
    );
  }

  const componentFiles = pickComponentFiles(body.files);
  if (Object.keys(componentFiles).length === 0) {
    return folderResolveError(
      "Folder map has no .tsx/.jsx/.ts/.js component files.",
      { code: "missing-entry" },
    );
  }

  const cssFromMap = collectCssFromVirtualFiles(body.files);
  const css =
    body.css !== undefined && body.css.length > 0 ? body.css : cssFromMap;

  const resolved = resolveSectionInput({
    files: componentFiles,
    entryPath: body.entryPath,
    componentName: body.componentName,
    sectionName: body.sectionName,
    convert: {
      language: (body.language ?? "auto") as ReactSourceLanguage,
      title: body.title ?? "converted-section",
      css,
      catalogTarget: "4.2.4",
    },
  });

  if (!resolved.ok) {
    return folderResolveError(resolved.error.message, {
      code: resolved.error.code,
      diagnostics: resolved.diagnostics,
      candidates: resolved.error.candidates,
    });
  }

  // Prefer convertSource with already-resolved options (no second resolve).
  const result = convertSource(resolved.convertOptions);
  return {
    status: 200,
    payload: { ok: true, result },
  };
}

/**
 * Shared convert handler used by the Route Handler and unit tests.
 * Modes are mutually exclusive: `source` XOR `files`.
 */
export function runConvertRequest(
  body: unknown,
): { status: number; payload: ConvertApiResponse } {
  if (!isPlainObject(body)) {
    return {
      status: 400,
      payload: { ok: false, error: "Invalid convert request." },
    };
  }

  const hasSource = hasNonEmptySource(body);
  const hasFiles = hasFilesMap(body);

  if (hasSource && hasFiles) {
    return {
      status: 400,
      payload: {
        ok: false,
        error:
          "Provide either source (single file) or files (section folder), not both.",
        code: "mutually-exclusive-modes",
      },
    };
  }

  if (hasFiles) {
    const parsed = ConvertFolderBodySchema.safeParse(body);
    if (!parsed.success) {
      return {
        status: 400,
        payload: {
          ok: false,
          error: "Invalid folder convert request.",
          code: "invalid-file-map",
          details: parsed.error.flatten(),
        },
      };
    }
    return runFolderConvert(parsed.data);
  }

  const parsed = ConvertSingleFileBodySchema.safeParse(body);
  if (!parsed.success) {
    return {
      status: 400,
      payload: {
        ok: false,
        error: "Invalid convert request.",
        details: parsed.error.flatten(),
      },
    };
  }

  return runSingleFileConvert(parsed.data);
}

export function estimateJsonBodyBytes(raw: string): number {
  return Buffer.byteLength(raw, "utf8");
}
