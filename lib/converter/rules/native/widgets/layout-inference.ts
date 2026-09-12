/**
 * Conservative horizontal layout inference for Free Container emission.
 *
 * Elementor treats unset flex_direction as column. CSS/Tailwind flex defaults
 * to row. We only invent row / grid columns when source cues clearly indicate
 * a horizontal cluster — never globally force every flex container to row.
 *
 * Lost arbitrary grids like `grid-cols-[minmax(0,1fr)_auto]` cannot be
 * represented as Free equal-fr tracks. Header chrome (logo | nav | mobile)
 * is converted to flex row + space-between instead of inventing N equal columns.
 */

import type { IrNode, IrStyle } from "../../../ir/schema";
import type { ElementorSettings } from "../types";
import { toGridColumns } from "../styles/values";
import type { NativeElementDraft } from "./leaf";
import { applyFlexRowNowrapDefault } from "./flex-child-width";

/** Inline-ish leaf widgets that typically sit in a horizontal chrome cluster. */
const INLINE_WIDGET_TYPES = new Set(["button", "icon", "image", "html"]);

const HORIZONTAL_JUSTIFY = new Set([
  "space-between",
  "space-around",
  "space-evenly",
  "center",
]);

function isColumnDirection(value: unknown): boolean {
  return value === "column" || value === "column-reverse";
}

function meaningfulChildren(
  children: NativeElementDraft[],
): NativeElementDraft[] {
  return children.filter((child) => {
    if (child.elType === "widget" && child.widgetType === "spacer") {
      return false;
    }
    return true;
  });
}

function isInlineWidgetCluster(children: NativeElementDraft[]): boolean {
  const kids = meaningfulChildren(children);
  if (kids.length < 2) return false;
  return kids.every(
    (child) =>
      child.elType === "widget" &&
      Boolean(child.widgetType) &&
      INLINE_WIDGET_TYPES.has(child.widgetType!),
  );
}

function irHasExplicitColumn(style: IrStyle | undefined): boolean {
  if (!style) return false;
  return isColumnDirection(style.layout?.flexDirection);
}

/**
 * True when layout facts imply a horizontal main axis (CSS flex default row
 * or typical navbar/chrome alignment cues), without an explicit column.
 */
export function hasHorizontalFlexCues(
  style: IrStyle | undefined,
  settings: ElementorSettings,
): boolean {
  if (irHasExplicitColumn(style)) return false;
  if (isColumnDirection(settings.flex_direction)) return false;

  const layout = style?.layout;
  if (layout?.display === "flex" || layout?.display === "inline-flex") {
    return true;
  }
  if (layout?.flexDirection === "row" || layout?.flexDirection === "row-reverse") {
    return true;
  }

  const justify = layout?.justifyContent;
  if (typeof justify === "string" && HORIZONTAL_JUSTIFY.has(justify)) {
    return true;
  }
  if (
    typeof settings.flex_justify_content === "string" &&
    HORIZONTAL_JUSTIFY.has(settings.flex_justify_content)
  ) {
    return true;
  }

  const align = layout?.alignItems ?? settings.flex_align_items;
  if (align === "center" || align === "baseline") {
    return true;
  }

  return false;
}

function inferFlexRow(args: {
  node: IrNode;
  settings: ElementorSettings;
  children: NativeElementDraft[];
}): void {
  const { node, settings, children } = args;
  if (settings.container_type === "grid") return;
  if (settings.container_type !== "flex") return;
  if (settings.flex_direction != null) return;
  if (isColumnDirection(settings.flex_direction)) return;
  if (irHasExplicitColumn(node.style)) return;

  const kids = meaningfulChildren(children);
  if (kids.length < 2) return;

  const cues = hasHorizontalFlexCues(node.style, settings);
  const inlineCluster = isInlineWidgetCluster(kids);
  if (!cues && !inlineCluster) return;

  settings.flex_direction = "row";
  applyFlexRowNowrapDefault(settings);
}

/**
 * Header-like chrome: items-center grid with a leaf (logo) and/or <nav>,
 * often including a mobile sibling that must not become a 3rd equal fr track.
 */
function looksLikeHeaderChrome(
  settings: ElementorSettings,
  children: NativeElementDraft[],
): boolean {
  const kids = meaningfulChildren(children);
  if (kids.length < 2 || kids.length > 3) return false;

  const align = settings.flex_align_items;
  if (align !== "center" && align !== "baseline") return false;

  const hasLeaf = kids.some(
    (k) =>
      k.elType === "widget" &&
      Boolean(k.widgetType) &&
      INLINE_WIDGET_TYPES.has(k.widgetType!),
  );
  const hasNav = kids.some((k) => k.settings.html_tag === "nav");
  return hasLeaf || hasNav;
}

/**
 * Convert lost arbitrary header grids to flex row + space-between.
 * Free cannot emit `1fr + auto`; equal-N fr caused Festive overlap.
 */
function convertChromeGridToFlex(settings: ElementorSettings): void {
  settings.container_type = "flex";
  settings.flex_direction = "row";
  if (settings.flex_justify_content == null) {
    settings.flex_justify_content = "space-between";
  }
  if (settings.flex_align_items == null) {
    settings.flex_align_items = "center";
  }
  delete settings.grid_columns_grid;
  delete settings.grid_columns_grid_tablet;
  delete settings.grid_columns_grid_mobile;
  applyFlexRowNowrapDefault(settings);
}

/**
 * When a grid has 2–3 tracks worth of children but no Free-compatible
 * grid_columns_grid (e.g. dropped Tailwind arbitrary grid-cols-[…]):
 * - header chrome → flex row + space-between
 * - otherwise → equal fr columns (2–3 only)
 */
function inferGridColumns(args: {
  node: IrNode;
  settings: ElementorSettings;
  children: NativeElementDraft[];
}): void {
  const { node, settings, children } = args;
  if (settings.container_type !== "grid") return;
  if (settings.grid_columns_grid != null) return;

  const rawTemplate = node.style?.layout?.gridTemplateColumns;
  if (rawTemplate && !toGridColumns(rawTemplate)) {
    // Explicit but unsupported template — do not invent a different track count.
    // Header chrome still benefits from flex space-between (Free cannot do 1fr+auto).
    if (looksLikeHeaderChrome(settings, children)) {
      convertChromeGridToFlex(settings);
    }
    return;
  }

  const n = meaningfulChildren(children).length;
  if (n < 2 || n > 3) return;

  if (looksLikeHeaderChrome(settings, children)) {
    convertChromeGridToFlex(settings);
    return;
  }

  settings.grid_columns_grid = { unit: "fr", size: n };
}

/**
 * Apply after children are converted so inference can use child shape/count.
 */
export function applyHorizontalLayoutInference(args: {
  node: IrNode;
  settings: ElementorSettings;
  children: NativeElementDraft[];
}): void {
  inferFlexRow(args);
  inferGridColumns(args);
}
