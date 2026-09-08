/**
 * Converter library public surface.
 *
 * Phase 0: IR / report / decision contracts.
 * Phase 1: Elementor Free capability catalog (no conversion engine).
 * Phase 2: IR schema + normalization + fixture corpus (no JSX/Elementor conversion).
 * Phase 5: Native Free conversion (`convertToNativeElementor`).
 * Phase 6: Node-scoped custom HTML fallback (`convertToElementor`).
 * Phase 7: Unsupported handling + conversion report (`convert`).
 */

export {
  CONVERSION_DECISION_ORDER,
  ConversionDecisionSchema,
  ConversionOutcomeSchema,
  DiagnosticSeveritySchema,
  UnsupportedReasonCodeSchema,
  type ConversionDecision,
  type ConversionOutcome,
  type DiagnosticSeverity,
  type UnsupportedReasonCode,
} from "./types/decisions";

export {
  IR_SCHEMA_VERSION,
  IR_RECOMMENDED_BREAKPOINTS,
  IrDocumentSchema,
  IrNodeKindSchema,
  IrNodeSchema,
  IrNodeStatusSchema,
  IrStyleSchema,
  IrProvenanceSchema,
  IrDiagnosticSchema,
  IrUncertaintySchema,
  parseIrDocument,
  safeParseIrDocument,
  normalizeIrDocument,
  canonicalizeIrJson,
  type IrDocument,
  type IrNode,
  type IrNodeKind,
  type IrNodeStatus,
  type IrStyle,
  type IrProvenance,
  type IrDiagnostic,
  type IrUncertainty,
  type IrRecommendedBreakpoint,
} from "./ir";

export {
  CATALOG_SCHEMA_VERSION,
  ELEMENTOR_DOCUMENT_VERSION,
  EMPTY_ELEMENTOR_FREE_CATALOG_STUB,
  ElementorFreeCatalogSchema,
  DEFAULT_ELEMENTOR_FREE_TARGET,
  SUPPORTED_ELEMENTOR_FREE_TARGETS,
  loadElementorFreeCatalog,
  listAvailableElementorFreeCatalogTargets,
  canUseControl,
  canUseWidget,
  checkFreeCompliance,
  getCatalogWidget,
  isProDenylisted,
  type ElementorFreeCatalog,
  type FreeComplianceResult,
  type SupportedElementorFreeTarget,
} from "./catalog";

export {
  ConversionReportSchema,
  ConversionResultSchema,
  buildConversionReport,
  buildConversionResult,
  canonicalizeConversionReport,
  decisionsCoveringIrTree,
  deriveOutcome,
  normalizeReasonCode,
  reasonCodeForCustomFailure,
  type ConversionReport,
  type ConversionResult,
  type ReportDiagnostic,
  type ReportNodeEntry,
} from "./report";

export { convert, type ConvertOptions } from "./convert";

export {
  parseReactSource,
  analyzeReactAst,
  analyzeReactSource,
  ReactParseError,
  ParseReactSourceOptionsSchema,
  AnalyzeReactOptionsSchema,
  type ParseReactSourceOptions,
  type AnalyzeReactOptions,
  type ParsedReactSource,
  type AnalyzeReactResult,
  type ReactSourceLanguage,
} from "./parse";

export {
  resolveStyles,
  ResolveStylesOptionsSchema,
  STYLE_MERGE_PRECEDENCE,
  resolveTailwindClasses,
  resolveTailwindUtility,
  parseCssSources,
  resolveInlineStyleRaw,
  mergeIrStyles,
  type ResolveStylesOptions,
  type ResolveStylesResult,
} from "./styles";

export {
  convertToNativeElementor,
  convertToElementor,
  convertIrNodeWithFallback,
  convertCustomFallback,
  serializeIrNodeHtml,
  serializeScopedCss,
  escapeHtmlAttr,
  escapeHtmlText,
  findUnsafeCustomPatterns,
  elementorIdFromIrId,
  NativeStrategySchema,
  type ConvertToNativeOptions,
  type ConvertToElementorOptions,
  type NativeStrategy,
  type NativeNodeDecision,
  type NativeConversionResult,
  type ElementorDocument,
  type ElementorElement,
  type ElementorSettings,
} from "./rules";

export {
  validateElementorDocument,
  canonicalizeElementorJson,
  type EmitValidationResult,
} from "./emit";
