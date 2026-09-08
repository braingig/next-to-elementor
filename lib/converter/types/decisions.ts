import { z } from "zod";

/** Per-node conversion decision (Phase 6+). */
export const ConversionDecisionSchema = z.enum([
  "native",
  "custom",
  "unsupported",
]);
export type ConversionDecision = z.infer<typeof ConversionDecisionSchema>;

/** Whole-pipeline outcome. */
export const ConversionOutcomeSchema = z.enum([
  "success",
  "partial",
  "failed",
]);
export type ConversionOutcome = z.infer<typeof ConversionOutcomeSchema>;

/**
 * Stable unsupported reason codes.
 * See docs/unsupported-policy.md.
 */
export const UnsupportedReasonCodeSchema = z.enum([
  "dynamic-content",
  "dynamic-children",
  "unknown-component",
  "unknown-tailwind-class",
  "unknown-css",
  "animation-unsupported",
  "interaction-unsupported",
  "layout-unsupported",
  "asset-unresolved",
  "svg-complex",
  "form-unsupported",
  "pro-only-feature",
  "unsafe-custom",
  "media-unsupported",
  "responsive-unsupported",
  "semantic-ambiguous",
  "parse-error",
  "validation-error",
  "other",
]);
export type UnsupportedReasonCode = z.infer<typeof UnsupportedReasonCodeSchema>;

/** Diagnostic severity used in IR and reports. */
export const DiagnosticSeveritySchema = z.enum(["error", "warning", "info"]);
export type DiagnosticSeverity = z.infer<typeof DiagnosticSeveritySchema>;

/**
 * Ordered decision procedure (documentation constant).
 * Implementers must evaluate steps in this order per node.
 */
export const CONVERSION_DECISION_ORDER = [
  "native",
  "custom",
  "unsupported",
] as const satisfies readonly ConversionDecision[];
