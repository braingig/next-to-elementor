import type { IrDocument } from "../../ir/schema";
import {
  loadElementorFreeCatalog,
  type ElementorFreeCatalog,
  type SupportedElementorFreeTarget,
} from "../../catalog";
import { convertIrNode } from "./widgets/container";
import type {
  ElementorDocument,
  ElementorElement,
  NativeConversionResult,
  NativeNodeDecision,
} from "./types";
import { validateElementorDocument } from "../../emit/validate";

export type ConvertToNativeOptions = {
  catalog?: ElementorFreeCatalog;
  catalogTarget?: SupportedElementorFreeTarget;
  title?: string;
};

function flattenDecisions(decision: NativeNodeDecision): NativeNodeDecision[] {
  const out = [decision];
  for (const child of decision.children ?? []) {
    out.push(...flattenDecisions(child));
  }
  return out;
}

function toElementorElement(emit: {
  id: string;
  elType: "container" | "widget";
  widgetType?: string;
  settings: Record<string, unknown>;
  elements: Array<{
    id: string;
    elType: "container" | "widget";
    widgetType?: string;
    settings: Record<string, unknown>;
    elements: Array<unknown>;
  }>;
}): ElementorElement {
  return {
    id: emit.id,
    elType: emit.elType,
    ...(emit.widgetType ? { widgetType: emit.widgetType } : {}),
    ...(emit.elType === "container" ? { isInner: false } : {}),
    settings: emit.settings,
    elements: emit.elements.map((child) =>
      toElementorElement(
        child as {
          id: string;
          elType: "container" | "widget";
          widgetType?: string;
          settings: Record<string, unknown>;
          elements: Array<{
            id: string;
            elType: "container" | "widget";
            widgetType?: string;
            settings: Record<string, unknown>;
            elements: Array<unknown>;
          }>;
        },
      ),
    ),
  };
}

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
