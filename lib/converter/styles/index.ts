/**
 * Phase 4: CSS + curated Tailwind style resolution.
 * Produces styled IR. No Elementor mapping.
 */

export { resolveStyles } from "./resolve";
export {
  ResolveStylesOptionsSchema,
  STYLE_MERGE_PRECEDENCE,
  type ResolveStylesOptions,
  type ResolveStylesResult,
} from "./types";
export { resolveTailwindClasses, resolveTailwindUtility } from "./tailwind/map";
export { parseCssSources } from "./css/parse";
export { resolveInlineStyleRaw } from "./inline";
export { mergeIrStyles, declarationsToIrStyle } from "./declarations";
