import type { IrDocument } from "../../ir/schema";
import type { IrNode } from "../../ir/schema";
import {
  loadElementorFreeCatalog,
  type ElementorFreeCatalog,
  type SupportedElementorFreeTarget,
} from "../../catalog";
import { convertIrNode } from "../native/widgets/container";
import type {
  ElementorDocument,
  NativeConversionResult,
} from "../native/types";
import {
  flattenDecisions,
  toElementorElement,
  validateElementorDocument,
} from "../../emit";
import { detectNativeFidelityGap } from "../native/fidelity";
import { convertCustomFallback } from "./convert";
import type { NativeEmit } from "../native/widgets/leaf";

export type ConvertToElementorOptions = {
  catalog?: ElementorFreeCatalog;
  catalogTarget?: SupportedElementorFreeTarget;
  title?: string;
};

/**
 * Per-node decision order:
 * accurate Free native → node-scoped custom HTML fallback → unsupported
 *
 * Escalate to custom when Free native would only partially map style/layout
 * (transforms, unequal grids, gradients, multi-layer shadows, lossy responsive).
 */
export function convertIrNodeWithFallback(
  node: IrNode,
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const fidelityGap = detectNativeFidelityGap(node);
  if (fidelityGap) {
    return convertCustomFallback(node, catalog, fidelityGap.message);
  }

  const native = convertIrNode(node, catalog, convertIrNodeWithFallback);

  if (native.decision.strategy === "needs-fallback") {
    return convertCustomFallback(node, catalog, native.decision.message);
  }

  return native;
}

/**
 * Convert styled IR to classic Elementor Free JSON with node-scoped custom fallback.
 * Does not change Phase 5 native mappings — only upgrades `needs-fallback` nodes.
 */
export function convertToElementor(
  ir: IrDocument,
  options: ConvertToElementorOptions = {},
): NativeConversionResult {
  const catalog =
    options.catalog ??
    loadElementorFreeCatalog(options.catalogTarget ?? "4.2.4");

  const rootEmit = convertIrNodeWithFallback(ir.root, catalog);
  const decisions = flattenDecisions(rootEmit.decision);

  const representableCount = decisions.filter(
    (d) => d.strategy === "native" || d.strategy === "custom",
  ).length;
  const unsupportedCount = decisions.filter(
    (d) => d.strategy === "unsupported",
  ).length;
  // needs-fallback should not remain after Phase 6; treat as unsupported if present
  const leftoverFallback = decisions.filter(
    (d) => d.strategy === "needs-fallback",
  ).length;

  if (!rootEmit.element) {
    return {
      outcome: "failed",
      decisions,
      compliancePassed: true,
      complianceViolations: [],
    };
  }

  const document: ElementorDocument = {
    version: "0.4",
    title: options.title ?? ir.meta.sourceName ?? "Converted section",
    type: "page",
    content: [toElementorElement(rootEmit.element)],
  };

  const validation = validateElementorDocument(document, catalog);

  let outcome: NativeConversionResult["outcome"] = "success";
  if (!validation.passed) {
    outcome = "failed";
  } else if (unsupportedCount > 0 || leftoverFallback > 0) {
    outcome = "partial";
  } else if (representableCount === 0) {
    outcome = "failed";
  }

  return {
    outcome,
    document: validation.passed ? document : undefined,
    decisions,
    compliancePassed: validation.passed,
    complianceViolations: validation.violations,
  };
}

export { convertCustomFallback } from "./convert";
export { serializeIrNodeHtml } from "./html";
export {
  serializeScopedCss,
  serializeSubtreeScopedCss,
  scopedClassForNode,
} from "./css";
export {
  escapeHtmlAttr,
  escapeHtmlText,
  findUnsafeCustomPatterns,
} from "./safety";
