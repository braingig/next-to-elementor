import { z } from "zod";

/** Per-node conversion decision (Phase 6+). */
export const ConversionDecisionSchema = z.enum([
  "native",
  "custom",
  "unsupported",
]);
export type ConversionDecision = z.infer<typeof ConversionDecisionSchema>;

/**
 * Whole-pipeline accuracy status (Phase 7).
 * Lower-level native APIs may still use `"success"` as a synonym for complete
 * representation without a full report.
 */
export const ConversionOutcomeSchema = z.enum([
  "complete",
  "partial",
  "failed",
]);
export type ConversionOutcome = z.infer<typeof ConversionOutcomeSchema>;

/**
 * Stable unsupported / accuracy reason codes.
 * See docs/unsupported-policy.md and docs/phase-7.md.
 */
export const UnsupportedReasonCodeSchema = z.enum([
  // Phase 7 preferred codes
  "unsupported-node-kind",
  "dynamic-content",
  "dynamic-children",
  "unknown-component",
  "unsupported-css",
  "unresolved-style",
  "unsafe-html",
  "unsafe-url",
  "unsupported-interaction",
  "insufficient-source-information",
  "native-mapping-unavailable",
  "custom-fallback-unavailable",
  // Retained codes (parse / style / legacy emitters)
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
