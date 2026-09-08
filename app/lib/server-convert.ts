import { z } from "zod";
import {
  convertSource,
  type ConversionResult,
  type ReactSourceLanguage,
} from "@/lib/converter";

/** Section-sized inputs only — protects the sync conversion path. */
export const MAX_CONVERT_BODY_BYTES = 512 * 1024;

export const ConvertRequestBodySchema = z
  .object({
    source: z.string().min(1, "source is required"),
    css: z.string().optional(),
    language: z.enum(["tsx", "jsx", "auto"]).optional(),
    title: z.string().min(1).max(200).optional(),
  })
  .strict();

export type ConvertRequestBody = z.infer<typeof ConvertRequestBodySchema>;

export type ConvertApiSuccess = {
  ok: true;
  result: ConversionResult;
};

export type ConvertApiError = {
  ok: false;
  error: string;
  details?: unknown;
};

export type ConvertApiResponse = ConvertApiSuccess | ConvertApiError;

/**
 * Shared convert handler used by the Route Handler and unit tests.
 * Never executes user source — delegates to static convertSource only.
 */
export function runConvertRequest(
  body: unknown,
): { status: number; payload: ConvertApiResponse } {
  const parsed = ConvertRequestBodySchema.safeParse(body);
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

  const { source, css, language, title } = parsed.data;
  const result = convertSource({
    source,
    css: css ?? "",
    language: (language ?? "auto") as ReactSourceLanguage,
    title: title ?? "converted-section",
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

export function estimateJsonBodyBytes(raw: string): number {
  return Buffer.byteLength(raw, "utf8");
}
