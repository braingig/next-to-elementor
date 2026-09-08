import type { ConversionResult } from "@/lib/converter";
import type { ConvertApiResponse } from "@/app/lib/server-convert";

export type ConvertClientInput = {
  source: string;
  css?: string;
  language?: "tsx" | "jsx" | "auto";
  title?: string;
};

export type ConvertClientResult =
  | { ok: true; result: ConversionResult }
  | { ok: false; error: string; status?: number; details?: unknown };

/**
 * Browser-side caller for POST /api/convert.
 * Does not import Node-only converter modules.
 */
export async function requestConvert(
  input: ConvertClientInput,
): Promise<ConvertClientResult> {
  const res = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: input.source,
      ...(input.css !== undefined ? { css: input.css } : {}),
      ...(input.language ? { language: input.language } : {}),
      ...(input.title ? { title: input.title } : {}),
    }),
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
