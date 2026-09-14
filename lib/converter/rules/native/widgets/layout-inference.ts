/**
 * Conservative horizontal layout inference for Free Container emission.
 *
 * Elementor treats unset flex_direction as column. CSS/Tailwind flex defaults
 * to row. We only invent row / grid columns when source cues clearly indicate
 * a horizontal cluster — never globally force every flex container to row.
 *
 * Lost arbitrary grids like `grid-cols-[minmax(0,1fr)_auto]` cannot be
 * represented as Free equal-fr tracks. Those escalate to node-scoped Free HTML
 * custom fallback (see `detectNativeFidelityGap`) instead of inventing flex.
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
 * Header-like chrome: items-center (or space-between) cluster with a leaf
 * (logo/CTA) and/or <nav>, often including a mobile sibling that must not
 * become an equal fr track.
 */
function looksLikeHeaderChrome(
  settings: ElementorSettings,
  children: NativeElementDraft[],
  node?: IrNode,
): boolean {
  const kids = meaningfulChildren(children);
  if (kids.length < 2 || kids.length > 3) return false;

  const align = settings.flex_align_items;
  const justify = settings.flex_justify_content;
  const alignOk =
    align === "center" ||
    align === "baseline" ||
    justify === "space-between" ||
    justify === "space-around" ||
    justify === "space-evenly";
  if (!alignOk) return false;

  const hasLeaf = kids.some(
    (k) =>
      k.elType === "widget" &&
      Boolean(k.widgetType) &&
      INLINE_WIDGET_TYPES.has(k.widgetType!),
  );
  const hasNav = kids.some((k) => k.settings.html_tag === "nav");
  const isHeaderTag =
    node?.provenance?.htmlTag?.toLowerCase() === "header" ||
    (typeof node?.props === "object" &&
      node &&
      "as" in node.props &&
      String((node.props as { as?: string }).as ?? "").toLowerCase() ===
        "header");
  return hasLeaf || hasNav || Boolean(isHeaderTag);
}

/**
 * Detect CSS/Tailwind arbitrary templates that mean "first track grows,
 * remaining tracks hug content" — e.g. `minmax(0,1fr)_auto`, `1fr auto`.
 */
export function isOneFrAutoGridTemplate(
  rawTemplate: string | undefined,
): boolean {
  if (!rawTemplate) return false;
  const n = rawTemplate.toLowerCase().replace(/\s+/g, "");
  const frIdx = n.search(/1fr/);
  const autoIdx = n.search(/auto/);
  if (frIdx < 0 || autoIdx < 0 || frIdx > autoIdx) return false;
  const beforeAuto = n.slice(0, autoIdx);
  const frCount = beforeAuto.match(/1fr/g)?.length ?? 0;
  return frCount === 1;
}

/**
 * Desktop-only vs mobile-only chrome siblings (e.g. `hidden lg:flex` nav +
 * `lg:hidden` CTA). space-between across all three leaves a huge middle gap
 * when the hidden sibling still occupies a flex slot in the editor.
 */
function hasComplementaryResponsiveChrome(
  children: NativeElementDraft[],
): boolean {
  const kids = meaningfulChildren(children);
  if (kids.length < 3) return false;

  let desktopOnly = 0;
  let mobileOnly = 0;
  for (const kid of kids) {
    const s = kid.settings;
    const hideDesktop = Boolean(s.hide_desktop);
    const hideTablet = Boolean(s.hide_tablet);
    const hideMobile = Boolean(s.hide_mobile);
    if (!hideDesktop && hideTablet && hideMobile) desktopOnly += 1;
    if (hideDesktop && !hideTablet && !hideMobile) mobileOnly += 1;
  }
  return desktopOnly >= 1 && mobileOnly >= 1;
}

/** Push auto-track siblings to the end — CSS flex equivalent of `1fr auto`. */
function mergeMarginLeftAuto(settings: ElementorSettings): void {
  const existing = settings.margin;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    const prev = existing as Record<string, unknown>;
    // Do not override an explicit non-auto source margin-left.
    if (prev.left != null && prev.left !== "0" && prev.left !== 0) {
      return;
    }
    settings.margin = {
      ...prev,
      left: "auto",
      isLinked: false,
    };
    return;
  }
  settings.margin = {
    unit: "px",
    top: "0",
    right: "0",
    bottom: "0",
    left: "auto",
    isLinked: false,
  };
}

/**
 * Approximate `1fr + auto(+…)` : first child stays content-sized at the start;
 * later siblings get margin-left:auto so free space sits between the 1fr cell
 * and the auto cluster (logo |····| nav+CTA), not between every sibling.
 */
export function applyOneFrAutoFlexDistribution(
  children: NativeElementDraft[],
): void {
  const kids = meaningfulChildren(children);
  if (kids.length < 2) return;
  for (let i = 1; i < kids.length; i += 1) {
    mergeMarginLeftAuto(kids[i]!.settings);
  }
}

/**
 * Convert lost arbitrary header grids to flex row.
 * - `1fr + auto` (or complementary responsive chrome): start + ml:auto
 * - otherwise: space-between (2-item chrome bars)
 */
function convertChromeGridToFlex(
  settings: ElementorSettings,
  children: NativeElementDraft[],
  rawTemplate?: string,
): void {
  settings.container_type = "flex";
  settings.flex_direction = "row";
  if (settings.flex_align_items == null) {
    settings.flex_align_items = "center";
  }
  delete settings.grid_columns_grid;
  delete settings.grid_columns_grid_tablet;
  delete settings.grid_columns_grid_mobile;

  const oneFrAuto =
    isOneFrAutoGridTemplate(rawTemplate) ||
    hasComplementaryResponsiveChrome(children);

  if (oneFrAuto) {
    // Prefer start + ml:auto over space-between so a third (responsive) sibling
    // does not claim the middle flex slot and inflate horizontal empty space.
    if (
      settings.flex_justify_content == null ||
      settings.flex_justify_content === "space-between"
    ) {
      // space-between may have been set from a prior equal-track guess; replace
      // only when we are applying the 1fr+auto approximation.
      settings.flex_justify_content = "start";
    }
    applyOneFrAutoFlexDistribution(children);
  } else if (settings.flex_justify_content == null) {
    settings.flex_justify_content = "space-between";
  }

  applyFlexRowNowrapDefault(settings);
}

/**
 * When a grid has 2–3 tracks worth of children but no Free-compatible
 * grid_columns_grid (e.g. dropped Tailwind arbitrary grid-cols-[…]):
 * - unsupported templates are NOT approximated here — callers escalate to custom
 * - header chrome with equal missing columns → flex row only when no raw template
 * - otherwise → equal fr columns (2–3 only) when Free can represent them
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
    // Explicit but unsupported template — leave unset so the container layer
    // escalates to custom HTML instead of inventing flex/equal-fr tracks.
    return;
  }

  const n = meaningfulChildren(children).length;
  if (n < 2 || n > 3) return;

  if (looksLikeHeaderChrome(settings, children, node)) {
    convertChromeGridToFlex(settings, children, rawTemplate);
    return;
  }

  settings.grid_columns_grid = { unit: "fr", size: n };
}

/**
 * Flex `justify-between` with complementary responsive siblings has the same
 * middle-gap failure mode as a 3-item chrome grid. Rewrite to the 1fr+auto
 * approximation when hide_* polarity shows desktop-only + mobile-only kids.
 */
function rewriteComplementarySpaceBetween(args: {
  settings: ElementorSettings;
  children: NativeElementDraft[];
}): void {
  const { settings, children } = args;
  if (settings.container_type === "grid") return;
  if (settings.flex_direction !== "row" && settings.flex_direction !== "row-reverse") {
    return;
  }
  if (settings.flex_justify_content !== "space-between") return;
  if (!hasComplementaryResponsiveChrome(children)) return;

  settings.flex_justify_content = "start";
  applyOneFrAutoFlexDistribution(children);
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
  rewriteComplementarySpaceBetween(args);
}
