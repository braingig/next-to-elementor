/**
 * Intermediate Representation (Phase 2).
 * Elementor-agnostic semantic tree + fixtures helpers.
 * No JSX parsing and no Elementor conversion.
 */

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
  type IrDocument,
  type IrNode,
  type IrNodeKind,
  type IrNodeStatus,
  type IrStyle,
  type IrProvenance,
  type IrDiagnostic,
  type IrUncertainty,
  type IrRecommendedBreakpoint,
} from "./schema";

export { canonicalizeIrJson, normalizeIrDocument } from "./normalize";
