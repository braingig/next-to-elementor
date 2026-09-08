import type { ElementorFreeCatalog } from "../catalog/schema";
import { checkFreeCompliance } from "../catalog/compliance";
import type { ElementorDocument, ElementorElement } from "../rules/native/types";
import type { ElementorSourceInventory } from "./source-inventory";
import { MVP_WIDGETS } from "./source-inventory";

export type StaticCompatViolation = {
  id: string;
  kind:
    | "version"
    | "structure"
    | "widget"
    | "control"
    | "responsive"
    | "pro"
    | "dynamic"
    | "settings";
  message: string;
};

export type StaticCompatResult = {
  /** STATIC COMPATIBILITY VALIDATION — not a runtime import pass. */
  label: "STATIC PASS" | "STATIC FAIL";
  passed: boolean;
  violations: StaticCompatViolation[];
  widgetsSeen: string[];
  settingKeysSeen: string[];
  responsiveSuffixesSeen: Array<"_tablet" | "_mobile">;
};

function walk(
  elements: ElementorElement[],
  visit: (el: ElementorElement, path: string) => void,
  path = "content",
): void {
  elements.forEach((el, i) => {
    const p = `${path}[${i}]`;
    visit(el, p);
    walk(el.elements, visit, `${p}.elements`);
  });
}

function responsiveSuffix(
  key: string,
): "_tablet" | "_mobile" | null {
  if (key.endsWith("_tablet")) return "_tablet";
  if (key.endsWith("_mobile")) return "_mobile";
  return null;
}

/**
 * Static compatibility validation of converter output against:
 * - Elementor Free 4.2.4 PHP source inventory
 * - Project Free catalog / denylist
 *
 * This is NOT a claim that WordPress/Elementor successfully imported the JSON.
 */
export function validateStaticElementorCompatibility(
  document: ElementorDocument,
  inventory: ElementorSourceInventory,
  catalog: ElementorFreeCatalog,
): StaticCompatResult {
  const violations: StaticCompatViolation[] = [];
  const widgetsSeen = new Set<string>();
  const settingKeysSeen = new Set<string>();
  const responsiveSuffixesSeen = new Set<"_tablet" | "_mobile">();

  if (document.version !== "0.4") {
    violations.push({
      id: "version",
      kind: "version",
      message: `Classic document version must be "0.4" for Elementor Free ${inventory.version}; got "${document.version}".`,
    });
  }

  if (inventory.version !== "4.2.4") {
    violations.push({
      id: "source-version",
      kind: "version",
      message: `Source inventory version must be 4.2.4; got "${inventory.version}".`,
    });
  }

  if (inventory.containerElementName !== "container") {
    violations.push({
      id: "container",
      kind: "widget",
      message: `Expected Free container element name "container"; source reported "${inventory.containerElementName}".`,
    });
  }

  for (const name of MVP_WIDGETS) {
    if (!inventory.freeWidgetNames.includes(name)) {
      violations.push({
        id: name,
        kind: "widget",
        message: `MVP widget "${name}" not found in Elementor Free ${inventory.version} includes/widgets.`,
      });
    }
  }

  // Breakpoint keys tablet/mobile must exist in Free source manager.
  for (const key of ["tablet", "mobile"]) {
    if (!inventory.breakpointKeysFromSource.includes(key)) {
      violations.push({
        id: `breakpoint:${key}`,
        kind: "responsive",
        message: `Elementor Free source is missing breakpoint key "${key}".`,
      });
    }
  }

  walk(document.content, (el, path) => {
    if (el.elType !== "container" && el.elType !== "widget") {
      violations.push({
        id: path,
        kind: "structure",
        message: `Invalid elType "${String(el.elType)}" at ${path}.`,
      });
      return;
    }

    if (el.elType === "container") {
      widgetsSeen.add("container");
      if (el.widgetType) {
        violations.push({
          id: path,
          kind: "structure",
          message: `Container must not set widgetType at ${path}.`,
        });
      }
    }

    if (el.elType === "widget") {
      const type = el.widgetType ?? "";
      widgetsSeen.add(type);
      if (!type) {
        violations.push({
          id: path,
          kind: "widget",
          message: `Widget missing widgetType at ${path}.`,
        });
      } else if (!inventory.freeWidgetNames.includes(type)) {
        violations.push({
          id: path,
          kind: "widget",
          message: `Widget type "${type}" is not a Free widget in Elementor ${inventory.version} source (${path}).`,
        });
      } else if (!(MVP_WIDGETS as readonly string[]).includes(type) && type) {
        // Non-MVP Free widgets are still Free-compatible if present in source,
        // but converter MVP should not emit them unexpectedly.
        violations.push({
          id: path,
          kind: "widget",
          message: `Unexpected non-MVP Free widget "${type}" emitted at ${path}.`,
        });
      }
    }

    const settings = el.settings ?? {};
    if ("__dynamic__" in settings) {
      violations.push({
        id: path,
        kind: "dynamic",
        message: `__dynamic__ present in settings at ${path}.`,
      });
    }

    for (const key of Object.keys(settings)) {
      settingKeysSeen.add(key);
      const suffix = responsiveSuffix(key);
      if (suffix) responsiveSuffixesSeen.add(suffix);
    }

    // Settings shape spot-checks for MVP widgets
    if (el.widgetType === "heading") {
      if (typeof settings.title !== "string") {
        violations.push({
          id: path,
          kind: "settings",
          message: `heading requires string settings.title at ${path}.`,
        });
      }
      if (
        settings.header_size != null &&
        typeof settings.header_size !== "string"
      ) {
        violations.push({
          id: path,
          kind: "settings",
          message: `heading.header_size must be a string tag at ${path}.`,
        });
      }
    }
    if (el.widgetType === "button") {
      if (settings.text != null && typeof settings.text !== "string") {
        violations.push({
          id: path,
          kind: "settings",
          message: `button.text must be a string at ${path}.`,
        });
      }
      if (settings.link != null && typeof settings.link !== "object") {
        violations.push({
          id: path,
          kind: "settings",
          message: `button.link must be an object at ${path}.`,
        });
      }
    }
    if (el.widgetType === "image") {
      const image = settings.image;
      if (image != null && (typeof image !== "object" || image === null)) {
        violations.push({
          id: path,
          kind: "settings",
          message: `image.image must be a media object at ${path}.`,
        });
      }
    }
    if (el.widgetType === "html") {
      if (typeof settings.html !== "string") {
        violations.push({
          id: path,
          kind: "settings",
          message: `html widget requires string settings.html at ${path}.`,
        });
      }
      if (
        inventory.htmlWidgetControlIds.length > 0 &&
        !inventory.htmlWidgetControlIds.includes("html")
      ) {
        violations.push({
          id: path,
          kind: "control",
          message: `Elementor Free html widget source does not declare control "html".`,
        });
      }
    }
    if (el.widgetType === "spacer" && settings.space != null) {
      if (typeof settings.space !== "object") {
        violations.push({
          id: path,
          kind: "settings",
          message: `spacer.space should be a slider object at ${path}.`,
        });
      }
    }
  });

  // Full document catalog compliance
  const full = checkFreeComplianceDocument(document, catalog);
  for (const v of full) {
    violations.push(v);
  }

  const passed = violations.length === 0;
  return {
    label: passed ? "STATIC PASS" : "STATIC FAIL",
    passed,
    violations,
    widgetsSeen: [...widgetsSeen].sort(),
    settingKeysSeen: [...settingKeysSeen].sort(),
    responsiveSuffixesSeen: [...responsiveSuffixesSeen].sort(),
  };
}

function checkFreeComplianceDocument(
  document: ElementorDocument,
  catalog: ElementorFreeCatalog,
): StaticCompatViolation[] {
  const out: StaticCompatViolation[] = [];
  walk(document.content, (el, path) => {
    const result = checkFreeCompliance(catalog, {
      elType: el.elType,
      widgetType: el.widgetType,
      settings: el.settings,
    });
    for (const v of result.violations) {
      out.push({
        id: `${path}:${v.id}`,
        kind:
          v.kind === "dynamic-value"
            ? "dynamic"
            : v.kind === "unknown-widget"
              ? "widget"
              : v.kind === "unknown-control"
                ? "control"
                : "pro",
        message: `${v.message} (${path})`,
      });
    }
  });
  return out;
}

/**
 * Scan raw JSON text/object for Pro contamination markers in converter output.
 */
export function scanProContamination(value: unknown): StaticCompatViolation[] {
  const violations: StaticCompatViolation[] = [];
  const json = JSON.stringify(value);
  if (json.includes("__dynamic__")) {
    violations.push({
      id: "__dynamic__",
      kind: "dynamic",
      message: "Converter output contains __dynamic__.",
    });
  }
  const proWidgets = [
    "form",
    "slides",
    "nav-menu",
    "posts",
    "portfolio",
    "gallery",
    "share-buttons",
    "theme-post-content",
  ];
  for (const w of proWidgets) {
    if (new RegExp(`"widgetType"\\s*:\\s*"${w}"`).test(json)) {
      violations.push({
        id: w,
        kind: "pro",
        message: `Pro/denylisted widgetType "${w}" found in output.`,
      });
    }
  }
  return violations;
}
