/**
 * Conversion rules.
 * Phase 5: native Free conversion (`./native`)
 * Phase 6: node-scoped custom HTML fallback (`./custom`)
 */

export * from "./native";
export {
  convertToElementor,
  convertIrNodeWithFallback,
  convertCustomFallback,
  serializeIrNodeHtml,
  serializeScopedCss,
  escapeHtmlAttr,
  escapeHtmlText,
  findUnsafeCustomPatterns,
  type ConvertToElementorOptions,
} from "./custom";
