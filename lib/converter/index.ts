/**
 * Converter library public surface.
 *
 * Phase 0: IR / report / decision contracts.
 * Phase 1: Elementor Free capability catalog (no conversion engine).
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
  IrDocumentSchema,
  IrNodeKindSchema,
  IrNodeSchema,
  IrStyleSchema,
  type IrDocument,
  type IrNode,
  type IrNodeKind,
  type IrStyle,
} from "./ir/schema";

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
