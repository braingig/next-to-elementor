export {
  ConversionReportSchema,
  ConversionResultSchema,
  ReportDiagnosticSchema,
  ReportNodeEntrySchema,
  ReportSummarySchema,
  FreeComplianceSchema,
  FreeComplianceViolationSchema,
  type ConversionReport,
  type ConversionResult,
  type ReportDiagnostic,
  type ReportNodeEntry,
  type ReportSummary,
  type FreeCompliance,
  type FreeComplianceViolation,
} from "./schema";

export {
  buildConversionReport,
  buildConversionResult,
  canonicalizeConversionReport,
  decisionsCoveringIrTree,
  deriveOutcome,
  type BuildConversionReportInput,
  type BuildConversionResultInput,
} from "./build";

export {
  normalizeReasonCode,
  reasonCodeForCustomFailure,
} from "./reasons";
