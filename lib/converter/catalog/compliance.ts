import type {
  ElementorFreeCatalog,
  CatalogControl,
  CatalogWidget,
  ProDenylistEntry,
} from "./schema";

export type FreeComplianceViolation = {
  id: string;
  kind: ProDenylistEntry["kind"] | "unknown-widget" | "unknown-control" | "legacy-layout" | "dynamic-value";
  message: string;
};

export type FreeComplianceResult = {
  passed: boolean;
  violations: FreeComplianceViolation[];
};

function denylistIndex(catalog: ElementorFreeCatalog) {
  const byId = new Map<string, ProDenylistEntry>();
  for (const entry of catalog.proDenylist) {
    byId.set(entry.id, entry);
  }
  return byId;
}

function widgetIndex(catalog: ElementorFreeCatalog) {
  const byId = new Map<string, CatalogWidget>();
  for (const widget of catalog.widgets) {
    byId.set(widget.id, widget);
  }
  return byId;
}

function allowedControlsForWidget(
  catalog: ElementorFreeCatalog,
  widget: CatalogWidget,
): Map<string, CatalogControl> {
  const map = new Map<string, CatalogControl>();
  for (const control of widget.controls) {
    map.set(control.id, control);
  }
  if (widget.inheritsGlobalControls) {
    for (const control of catalog.globalControls) {
      if (!map.has(control.id)) {
        map.set(control.id, control);
      }
    }
  }
  return map;
}

export function isProDenylisted(
  catalog: ElementorFreeCatalog,
  id: string,
): ProDenylistEntry | undefined {
  return denylistIndex(catalog).get(id);
}

export function getCatalogWidget(
  catalog: ElementorFreeCatalog,
  id: string,
): CatalogWidget | undefined {
  return widgetIndex(catalog).get(id);
}

/**
 * Returns true only for Free catalog widgets with status supported|partial.
 * Unknown widgets are not Free-allowed (fail closed).
 */
export function canUseWidget(
  catalog: ElementorFreeCatalog,
  widgetId: string,
): boolean {
  if (isProDenylisted(catalog, widgetId)) {
    return false;
  }
  const widget = getCatalogWidget(catalog, widgetId);
  if (!widget) {
    return false;
  }
  if (widget.tier !== "free") {
    return false;
  }
  return widget.status === "supported" || widget.status === "partial";
}

/**
 * Control is allowed when present on the widget (or inherited globals),
 * tier is free, and the control id is not on the Pro denylist.
 */
export function canUseControl(
  catalog: ElementorFreeCatalog,
  widgetId: string,
  controlId: string,
): boolean {
  if (isProDenylisted(catalog, controlId)) {
    return false;
  }
  const widget = getCatalogWidget(catalog, widgetId);
  if (!widget || !canUseWidget(catalog, widgetId)) {
    return false;
  }
  const allowed = allowedControlsForWidget(catalog, widget);
  const control = allowed.get(controlId);
  if (!control) {
    return false;
  }
  return control.tier === "free";
}

function looksLikeDynamicValue(value: unknown): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  if ("__dynamic__" in record) {
    return true;
  }
  // Common Elementor dynamic tag wrapper shapes
  if (record.dynamic && typeof record.dynamic === "object") {
    return true;
  }
  return false;
}

/**
 * Validate a proposed Elementor-like settings object / widget usage against
 * the Free catalog + Pro denylist. No conversion — gate only.
 */
export function checkFreeCompliance(
  catalog: ElementorFreeCatalog,
  input: {
    elType?: string;
    widgetType?: string;
    settings?: Record<string, unknown>;
  },
): FreeComplianceResult {
  const violations: FreeComplianceViolation[] = [];
  const deny = denylistIndex(catalog);

  if (input.elType === "section" || input.elType === "column") {
    violations.push({
      id: input.elType,
      kind: "legacy-layout",
      message: `Legacy elType "${input.elType}" is forbidden by MVP container-only layout policy.`,
    });
  }

  if (input.widgetType) {
    const denied = deny.get(input.widgetType);
    if (denied) {
      violations.push({
        id: denied.id,
        kind: denied.kind,
        message: denied.reason,
      });
    } else if (input.elType === "widget" || input.elType === undefined) {
      if (!canUseWidget(catalog, input.widgetType)) {
        violations.push({
          id: input.widgetType,
          kind: "unknown-widget",
          message: `Widget type "${input.widgetType}" is not in the Free ${catalog.elementorTarget} MVP catalog (fail closed).`,
        });
      }
    }
  }

  if (input.elType === "container") {
    if (!canUseWidget(catalog, "container")) {
      violations.push({
        id: "container",
        kind: "unknown-widget",
        message: "Container is missing from Free catalog.",
      });
    }
  }

  const settings = input.settings ?? {};
  if ("__dynamic__" in settings || deny.has("__dynamic__")) {
    if ("__dynamic__" in settings) {
      violations.push({
        id: "__dynamic__",
        kind: "dynamic-value",
        message:
          "Dynamic tag bindings (__dynamic__) are not allowed on the Free static conversion path.",
      });
    }
  }

  const subjectId =
    input.elType === "container" ? "container" : input.widgetType;

  for (const [key, value] of Object.entries(settings)) {
    const baseKey = key.replace(/_(tablet|mobile|widescreen|laptop|tablet_extra|mobile_extra)$/, "");

    const denied = deny.get(key) ?? deny.get(baseKey);
    if (denied) {
      violations.push({
        id: denied.id,
        kind: denied.kind,
        message: denied.reason,
      });
      continue;
    }

    if (looksLikeDynamicValue(value)) {
      violations.push({
        id: key,
        kind: "dynamic-value",
        message: `Setting "${key}" appears to contain a dynamic tag value, which is not safe for Free static conversion.`,
      });
    }

    if (
      subjectId &&
      (input.elType === "widget" || input.elType === "container")
    ) {
      // Responsive suffixes of known controls are allowed when the base id is allowed.
      const allowed =
        canUseControl(catalog, subjectId, baseKey) ||
        canUseControl(catalog, subjectId, key);
      if (!allowed) {
        violations.push({
          id: key,
          kind: "unknown-control",
          message: `Control "${key}" is not catalogued as Free-allowed for "${subjectId}" (or is Pro-denylisted).`,
        });
      }
    }
  }

  // Feature denylist probes that may appear as settings keys
  for (const featureId of ["sticky", "scrolling-effects"] as const) {
    if (featureId in settings) {
      const denied = deny.get(featureId);
      if (denied) {
        violations.push({
          id: denied.id,
          kind: denied.kind,
          message: denied.reason,
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
