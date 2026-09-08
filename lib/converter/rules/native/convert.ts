import type { IrDocument } from "../../ir/schema";
import {
  loadElementorFreeCatalog,
  type ElementorFreeCatalog,
  type SupportedElementorFreeTarget,
} from "../../catalog";
import { convertIrNode } from "./widgets/container";
import type {
  ElementorDocument,
  NativeConversionResult,
} from "./types";
import {
  flattenDecisions,
  toElementorElement,
  validateElementorDocument,
} from "../../emit";

export type ConvertToNativeOptions = {
  catalog?: ElementorFreeCatalog;
  catalogTarget?: SupportedElementorFreeTarget;
  title?: string;
};

/**
 * Convert a styled IR document into classic Elementor Free JSON (version 0.4)
 * using only catalog-verified native widgets/controls.
 */
export function convertToNativeElementor(
  ir: IrDocument,
  options: ConvertToNativeOptions = {},
): NativeConversionResult {
  const catalog =
    options.catalog ??
    loadElementorFreeCatalog(options.catalogTarget ?? "4.2.4");

  const rootEmit = convertIrNode(ir.root, catalog);
  const decisions = flattenDecisions(rootEmit.decision);

  const nativeCount = decisions.filter((d) => d.strategy === "native").length;
  const fallbackCount = decisions.filter(
    (d) => d.strategy === "needs-fallback",
  ).length;
  const unsupportedCount = decisions.filter(
    (d) => d.strategy === "unsupported",
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
  } else if (fallbackCount > 0 || unsupportedCount > 0) {
    outcome = "partial";
  } else if (nativeCount === 0) {
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
