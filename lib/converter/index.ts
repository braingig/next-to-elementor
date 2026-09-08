/**
 * Converter library public surface.
 *
 * Preferred entry points:
 * - `convertSource` — end-to-end React/TSX → Elementor JSON + report
 * - `convert` — styled IR → Elementor JSON + report
 * - `analyzeReactSource` / `resolveStyles` — lower pipeline stages
 *
 * Phase 10: `compat/` static Elementor Free 4.2.4 checks (runtime import BLOCKED here).
 *
 * Lower-level APIs (`convertToNativeElementor`, `convertToElementor`, …)
 * remain available and backward-compatible.
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
  convertSource,
  ConvertSourceOptionsSchema,
  type ConvertSourceOptions,
} from "./convert-source";

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
  mapIrStyleToSettings,
  cascadeMobileFirstToElementorTiers,
  toBoxShadow,
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
  flattenDecisions,
  toElementorElement,
  type EmitValidationResult,
  type ElementorElementDraft,
} from "./emit";

export {
  REQUIRED_ELEMENTOR_FREE_VERSION,
  resolveElementorFree424SourceRoot,
  readElementorVersion,
  probeRuntimeEnvironment,
  buildElementorSourceInventory,
  extractGetName,
  extractAddControlIds,
  MVP_WIDGETS,
  validateStaticElementorCompatibility,
  scanProContamination,
  getRuntimeImportStatus,
  type ElementorSourceInventory,
  type StaticCompatResult,
  type StaticCompatViolation,
  type RuntimeImportStatus,
  type RuntimeEnvironmentStatus,
} from "./compat";

export {
  probePhase11Runtime,
  runSetup,
  writeReport,
  readRuntimeEnv,
  generateDocumentFromFixture,
  importDocumentJson,
  collectWidgets,
  flattenWidgetTypes,
  collectResponsiveKeys,
  findFirstWidget,
  EXPECTED_NATIVE_TYPES,
  emptyBlockedReport,
  wpCli,
  type RuntimeValidationReport,
  type FixtureRuntimeResult,
  type RuntimeStatus,
  type VisualStatus,
} from "./runtime";
