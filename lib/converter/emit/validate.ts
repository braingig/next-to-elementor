import type { ElementorFreeCatalog } from "../catalog/schema";
import { checkFreeCompliance } from "../catalog/compliance";
import type { ElementorDocument, ElementorElement } from "../rules/native/types";

export type EmitValidationResult = {
  passed: boolean;
  violations: Array<{ id: string; kind: string; message: string }>;
};

function walkElements(
  elements: ElementorElement[],
  visit: (el: ElementorElement) => void,
): void {
  for (const el of elements) {
    visit(el);
    walkElements(el.elements, visit);
  }
}

/**
 * Validate emitted classic Elementor JSON against Free catalog compliance.
 */
export function validateElementorDocument(
  document: ElementorDocument,
  catalog: ElementorFreeCatalog,
): EmitValidationResult {
  const violations: Array<{ id: string; kind: string; message: string }> = [];

  if (document.version !== "0.4") {
    violations.push({
      id: "version",
      kind: "feature",
      message: `Expected classic document version "0.4", got "${document.version}".`,
    });
  }

  walkElements(document.content, (el) => {
    if (el.elType !== "container" && el.elType !== "widget") {
      violations.push({
        id: el.id,
        kind: "feature",
        message: `Invalid elType "${String(el.elType)}".`,
      });
      return;
    }

    if (el.elType === "widget" && !el.widgetType) {
      violations.push({
        id: el.id,
        kind: "unknown-widget",
        message: "Widget element is missing widgetType.",
      });
      return;
    }

    if (el.elType === "container" && el.widgetType) {
      violations.push({
        id: el.id,
        kind: "feature",
        message: "Container must not set widgetType.",
      });
    }

    const result = checkFreeCompliance(catalog, {
      elType: el.elType,
      widgetType: el.widgetType,
      settings: el.settings,
    });
    for (const v of result.violations) {
      violations.push({
        id: v.id,
        kind: v.kind,
        message: `${v.message} (element ${el.id})`,
      });
    }
  });

  return {
    passed: violations.length === 0,
    violations,
  };
}

export function canonicalizeElementorJson(document: ElementorDocument): string {
  return JSON.stringify(sortKeysDeep(document));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
