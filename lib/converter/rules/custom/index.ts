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
  ElementorElement,
  NativeConversionResult,
  NativeNodeDecision,
} from "../native/types";
import { validateElementorDocument } from "../../emit/validate";
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
 */
export function convertIrNodeWithFallback(
  node: IrNode,
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const native = convertIrNode(node, catalog, convertIrNodeWithFallback);

  if (native.decision.strategy === "needs-fallback") {
    return convertCustomFallback(node, catalog, native.decision.message);
  }

  return native;
}

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
export { serializeScopedCss } from "./css";
export {
  escapeHtmlAttr,
  escapeHtmlText,
  findUnsafeCustomPatterns,
} from "./safety";
