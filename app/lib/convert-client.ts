import type { ConversionResult } from "@/lib/converter";
import type { ConvertApiResponse } from "@/app/lib/server-convert";

export type ConvertClientSingleFileInput = {
  mode?: "file";
  source: string;
  css?: string;
  language?: "tsx" | "jsx" | "auto";
  title?: string;
};

export type ConvertClientFolderInput = {
  mode: "folder";
  files: Record<string, string>;
  entryPath?: string;
  componentName?: string;
  sectionName?: string;
  css?: string;
  language?: "tsx" | "jsx" | "auto";
  title?: string;
};

export type ConvertClientInput =
  | ConvertClientSingleFileInput
  | ConvertClientFolderInput;

/** @deprecated Use ConvertClientSingleFileInput / ConvertClientInput */
export type ConvertClientInputLegacy = {
  source: string;
  css?: string;
  language?: "tsx" | "jsx" | "auto";
  title?: string;
};

export type ConvertClientResult =
  | { ok: true; result: ConversionResult }
  | {
      ok: false;
      error: string;
      status?: number;
      details?: unknown;
      code?: string;
      diagnostics?: unknown;
      candidates?: string[];
    };

function buildRequestBody(input: ConvertClientInput): Record<string, unknown> {
  if (input.mode === "folder") {
    return {
      files: input.files,
      ...(input.entryPath ? { entryPath: input.entryPath } : {}),
      ...(input.componentName ? { componentName: input.componentName } : {}),
      ...(input.sectionName ? { sectionName: input.sectionName } : {}),
      ...(input.css !== undefined ? { css: input.css } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.title ? { title: input.title } : {}),
    };
  }

  return {
    source: input.source,
    ...(input.css !== undefined ? { css: input.css } : {}),
    ...(input.language ? { language: input.language } : {}),
    ...(input.title ? { title: input.title } : {}),
  };
}

/**
 * Browser-side caller for POST /api/convert.
 * Does not import Node-only converter modules (catalog / fs).
 */
export async function requestConvert(
  input: ConvertClientInput,
): Promise<ConvertClientResult> {
  const res = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildRequestBody(input)),
  });

  let payload: ConvertApiResponse | null = null;
  try {
    payload = (await res.json()) as ConvertApiResponse;
  } catch {
    return {
      ok: false,
      error: `Convert request failed (${res.status}).`,
      status: res.status,
    };
  }

  if (!payload.ok) {
    return {
      ok: false,
      error: payload.error,
      status: res.status,
      details: "details" in payload ? payload.details : undefined,
      code: "code" in payload ? payload.code : undefined,
      diagnostics: "diagnostics" in payload ? payload.diagnostics : undefined,
      candidates: "candidates" in payload ? payload.candidates : undefined,
    };
  }

  return { ok: true, result: payload.result };
}

export function downloadElementorJson(
  elementorDocument: unknown,
  filename = "elementor-document.json",
): void {
  const text = JSON.stringify(elementorDocument, null, 2);
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = window.document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
