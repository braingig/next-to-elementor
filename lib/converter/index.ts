/**
 * Converter library public surface.
 *
 * Phase 0: IR / report / decision contracts.
 * Phase 1: Elementor Free capability catalog (no conversion engine).
 * Phase 2: IR schema + normalization + fixture corpus (no JSX/Elementor conversion).
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
  type ConversionReport,
  type ConversionResult,
} from "./report/schema";

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
  elementorIdFromIrId,
  NativeStrategySchema,
  type ConvertToNativeOptions,
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
