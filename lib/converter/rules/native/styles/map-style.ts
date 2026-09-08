import type { IrStyle } from "../../../ir/schema";
import type { ElementorFreeCatalog } from "../../../catalog/schema";
import { canUseControl } from "../../../catalog/compliance";
import type { ElementorSettings } from "../types";
import {
  mapAlign,
  mapFlexAlign,
  mapFlexJustify,
  toDimensions,
  toDimensionsFromSides,
  toGaps,
  toSlider,
} from "./values";

/**
 * Map IR responsive keys to Elementor suffixes using catalog breakpoints.
 * - base / lg / xl / 2xl → desktop (no suffix)
 * - md → _tablet
 * - sm → _mobile
 */
export function irBreakpointToSuffix(
  catalog: ElementorFreeCatalog,
  irBp: string | "base",
): "" | "_tablet" | "_mobile" | null {
  if (irBp === "base") return "";
  for (const bp of catalog.breakpoints) {
    if (bp.mapsFromIr.includes(irBp)) {
      if (bp.id === "desktop") return "";
      if (bp.id === "tablet") return "_tablet";
      if (bp.id === "mobile") return "_mobile";
    }
  }
  // Unknown breakpoint — do not invent
  return null;
}

function setIfAllowed(
  catalog: ElementorFreeCatalog,
  widgetId: string,
  settings: ElementorSettings,
  controlId: string,
  value: unknown,
  responsive: boolean,
  suffix: "" | "_tablet" | "_mobile",
): void {
  if (value === undefined || value === null || value === "") return;
  const key = suffix && responsive ? `${controlId}${suffix}` : controlId;
  // Base key must be catalogued; responsive suffix allowed when control.responsive
  if (!canUseControl(catalog, widgetId, controlId)) {
    return;
  }
  if (suffix && !responsive) {
    return;
  }
  settings[key] = value;
}

export type StyleMapContext = {
  catalog: ElementorFreeCatalog;
  widgetId: string;
  /** Prefix for margin/padding: container uses "", widgets use "_" for globals. */
  spacingPrefix: "" | "_";
  /** Container uses margin/padding; widgets use _margin/_padding via globals. */
  backgroundPrefix?: "" | "_";
};

/**
 * Apply a single IrStyle slice (base or one breakpoint) into settings.
 */
export function applyIrStyleSlice(
  style: IrStyle | undefined,
  ctx: StyleMapContext,
  settings: ElementorSettings,
  suffix: "" | "_tablet" | "_mobile",
): void {
  if (!style) return;
  const { catalog, widgetId, spacingPrefix } = ctx;
  const bgPrefix = ctx.backgroundPrefix ?? spacingPrefix;
  const allow = (id: string, value: unknown, responsive = true) =>
    setIfAllowed(catalog, widgetId, settings, id, value, responsive, suffix);

  // Layout (container)
  if (style.layout?.display === "flex" || style.layout?.flexDirection) {
    allow("container_type", "flex", false);
  }
  if (style.layout?.display === "grid") {
    allow("container_type", "grid", false);
  }
  if (style.layout?.flexDirection) {
    allow("flex_direction", style.layout.flexDirection);
  }
  if (style.layout?.justifyContent) {
    allow("flex_justify_content", mapFlexJustify(style.layout.justifyContent));
  }
  if (style.layout?.alignItems) {
    allow("flex_align_items", mapFlexAlign(style.layout.alignItems));
  }
  if (style.layout?.gap) {
    allow("flex_gap", toGaps(style.layout.gap));
  }
  if (style.layout?.flexWrap) {
    const wrap =
      style.layout.flexWrap === "wrap"
        ? "wrap"
        : style.layout.flexWrap === "nowrap"
          ? "nowrap"
          : undefined;
    allow("flex_wrap", wrap);
  }
  if (style.layout?.overflow) {
    const o =
      style.layout.overflow === "hidden" || style.layout.overflow === "auto"
        ? style.layout.overflow
        : undefined;
    allow("overflow", o, false);
  }

  // Box spacing
  const pad = toDimensionsFromSides({
    all: style.box?.padding,
    top: style.box?.paddingTop,
    right: style.box?.paddingRight,
    bottom: style.box?.paddingBottom,
    left: style.box?.paddingLeft,
  });
  allow(`${spacingPrefix}padding`, pad);

  const margin = toDimensionsFromSides({
    all: style.box?.margin,
    top: style.box?.marginTop,
    right: style.box?.marginRight,
    bottom: style.box?.marginBottom,
    left: style.box?.marginLeft,
  });
  allow(`${spacingPrefix}margin`, margin);

  if (style.box?.width) {
    allow("width", toSlider(style.box.width));
    allow("_element_custom_width", toSlider(style.box.width));
  }
  if (style.box?.minHeight) {
    allow("min_height", toSlider(style.box.minHeight));
  }
  if (style.box?.height) {
    // spacer uses space; containers may use min_height
    allow("space", toSlider(style.box.height));
    allow("min_height", toSlider(style.box.height));
  }

  // Background
  if (style.background?.color) {
    allow(`${bgPrefix}background_background`, "classic", false);
    allow(`${bgPrefix}background_color`, style.background.color, false);
  }

  // Border
  if (style.border?.style || style.border?.width || style.border?.color) {
    allow(
      `${bgPrefix}border_border`,
      style.border.style && style.border.style !== "none"
        ? style.border.style
        : "solid",
      false,
    );
  }
  if (style.border?.width) {
    const dim = toDimensions(style.border.width);
    allow(`${bgPrefix}border_width`, dim, false);
  }
  if (style.border?.color) {
    allow(`${bgPrefix}border_color`, style.border.color, false);
  }
  if (style.border?.radius) {
    const dim = toDimensions(style.border.radius);
    allow(`${bgPrefix}border_radius`, dim);
    allow("border_radius", dim);
  }

  // Typography (widget-specific ids applied by callers for title_color etc.)
  if (style.typography?.fontFamily) {
    allow("typography_font_family", style.typography.fontFamily, false);
  }
  if (style.typography?.fontSize) {
    allow("typography_font_size", toSlider(style.typography.fontSize));
  }
  if (style.typography?.fontWeight) {
    allow("typography_font_weight", style.typography.fontWeight, false);
  }
  if (style.typography?.fontStyle) {
    allow("typography_font_style", style.typography.fontStyle, false);
  }
  if (style.typography?.textTransform) {
    allow("typography_text_transform", style.typography.textTransform, false);
  }
  if (style.typography?.textAlign) {
    allow("align", mapAlign(style.typography.textAlign));
  }

  // Position (globals)
  if (style.position?.position === "absolute" || style.position?.position === "fixed") {
    allow("_position", style.position.position, false);
  }
  if (style.position?.zIndex) {
    const n = Number(style.position.zIndex);
    if (!Number.isNaN(n)) allow("_z_index", n);
  }

  // Effects
  if (style.effects?.opacity) {
    // not always in catalog for every widget — only set if allowed
    allow("opacity", style.effects.opacity, false);
  }
}

/**
 * Map full IrStyle including responsive overrides into Elementor settings.
 */
export function mapIrStyleToSettings(
  style: IrStyle | undefined,
  ctx: StyleMapContext,
): ElementorSettings {
  const settings: ElementorSettings = {};
  if (!style) return settings;

  applyIrStyleSlice(style, ctx, settings, "");

  if (style.responsive) {
    for (const [bp, partial] of Object.entries(style.responsive)) {
      const suffix = irBreakpointToSuffix(ctx.catalog, bp);
      if (suffix === null) continue;
      applyIrStyleSlice(partial, ctx, settings, suffix);
    }
  }

  return settings;
}
