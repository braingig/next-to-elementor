import type { IrStyle } from "../../../ir/schema";
import type { ElementorFreeCatalog } from "../../../catalog/schema";
import { canUseControl } from "../../../catalog/compliance";
import type { ElementorSettings } from "../types";
import {
  mapAlign,
  mapFlexAlign,
  mapFlexJustify,
  toBoxShadow,
  toDimensions,
  toDimensionsFromSides,
  toGaps,
  toGapsAxes,
  toGridColumns,
  toSlider,
} from "./values";

/** Tailwind / IR mobile-first breakpoint order (smallest → largest). */
const IR_BP_ORDER = ["sm", "md", "lg", "xl", "2xl"] as const;

type StyleGroup = keyof Pick<
  IrStyle,
  | "box"
  | "layout"
  | "typography"
  | "background"
  | "border"
  | "position"
  | "effects"
>;

const STYLE_GROUPS: StyleGroup[] = [
  "box",
  "layout",
  "typography",
  "background",
  "border",
  "position",
  "effects",
];

/**
 * Map IR responsive keys to Elementor suffixes using catalog breakpoints.
 * Used for capability checks / diagnostics — emission uses mobile-first cascade.
 * - lg / xl / 2xl → desktop (no suffix)
 * - md → _tablet
 * - sm → recognized (cascade handles polarity; not applied as raw _mobile)
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

type CascadedTiers = {
  desktop: IrStyle;
  tablet?: IrStyle;
  mobile?: IrStyle;
};

/**
 * Convert mobile-first IR styles into Elementor desktop-first tiers.
 *
 * - Desktop (unsuffixed) ← highest breakpoint override, else base
 * - Tablet (_tablet) ← `md` when present; otherwise, when the only larger
 *   overrides are `lg`/`xl`/`2xl`, keep the pre-lg effective value (base,
 *   then `sm`) so Elementor tablet does not inherit desktop `lg+` values
 * - Mobile (_mobile) ← base, only when that property has a responsive override
 */
export function cascadeMobileFirstToElementorTiers(style: IrStyle): CascadedTiers {
  const desktop: IrStyle = {};
  const tablet: IrStyle = {};
  const mobile: IrStyle = {};
  let hasTablet = false;
  let hasMobile = false;

  for (const group of STYLE_GROUPS) {
    const baseGroup = style[group] as Record<string, unknown> | undefined;
    const keys = new Set<string>();
    if (baseGroup) {
      for (const k of Object.keys(baseGroup)) keys.add(k);
    }
    for (const bp of IR_BP_ORDER) {
      const partial = style.responsive?.[bp]?.[group] as
        | Record<string, unknown>
        | undefined;
      if (partial) {
        for (const k of Object.keys(partial)) keys.add(k);
      }
    }

    if (keys.size === 0) continue;

    const deskGroup: Record<string, unknown> = {};
    const tabGroup: Record<string, unknown> = {};
    const mobGroup: Record<string, unknown> = {};

    for (const key of keys) {
      const baseVal = baseGroup?.[key];
      const overrides: Partial<Record<(typeof IR_BP_ORDER)[number], unknown>> =
        {};
      for (const bp of IR_BP_ORDER) {
        const v = (
          style.responsive?.[bp]?.[group] as Record<string, unknown> | undefined
        )?.[key];
        if (v !== undefined) overrides[bp] = v;
      }

      const overrideBps = IR_BP_ORDER.filter((bp) => overrides[bp] !== undefined);

      if (overrideBps.length === 0) {
        if (baseVal !== undefined) deskGroup[key] = baseVal;
        continue;
      }

      const highest = overrideBps[overrideBps.length - 1]!;
      deskGroup[key] = overrides[highest];

      if (overrides.md !== undefined) {
        tabGroup[key] = overrides.md;
        hasTablet = true;
      } else if (
        overrides.lg !== undefined ||
        overrides.xl !== undefined ||
        overrides["2xl"] !== undefined
      ) {
        // No `md:` — Elementor tablet is still below `lg`. Use the value that
        // applies in the pre-lg band (base, then `sm`) instead of inheriting
        // the desktop `lg+` override.
        let tabletVal = baseVal;
        if (overrides.sm !== undefined) tabletVal = overrides.sm;
        if (tabletVal !== undefined && tabletVal !== deskGroup[key]) {
          tabGroup[key] = tabletVal;
          hasTablet = true;
        }
      }

      if (baseVal !== undefined) {
        mobGroup[key] = baseVal;
        hasMobile = true;
      }
    }

    if (Object.keys(deskGroup).length > 0) {
      desktop[group] = deskGroup as never;
    }
    if (Object.keys(tabGroup).length > 0) {
      tablet[group] = tabGroup as never;
    }
    if (Object.keys(mobGroup).length > 0) {
      mobile[group] = mobGroup as never;
    }
  }

  return {
    desktop,
    ...(hasTablet ? { tablet } : {}),
    ...(hasMobile ? { mobile } : {}),
  };
}

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
  } else if (style.layout?.display === "flex" && suffix === "") {
    // CSS / Tailwind `display: flex` defaults to row — never invent column.
    allow("flex_direction", "row");
  }
  const gridColumns = toGridColumns(style.layout?.gridTemplateColumns);
  if (gridColumns) {
    allow("container_type", "grid", false);
    allow("grid_columns_grid", gridColumns);
  }
  if (style.layout?.justifyContent) {
    allow("flex_justify_content", mapFlexJustify(style.layout.justifyContent));
  }
  if (style.layout?.alignItems) {
    allow("flex_align_items", mapFlexAlign(style.layout.alignItems));
  }
  if (style.layout?.columnGap || style.layout?.rowGap) {
    allow(
      "flex_gap",
      toGapsAxes({
        column: style.layout.columnGap ?? style.layout.gap,
        row: style.layout.rowGap ?? style.layout.gap,
      }),
    );
  } else if (style.layout?.gap) {
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
  // Source white-space:nowrap on a flex chrome container → keep items on one line.
  if (
    style.typography?.whiteSpace === "nowrap" &&
    (style.layout?.display === "flex" ||
      style.layout?.display === "inline-flex" ||
      style.layout?.flexDirection === "row" ||
      style.layout?.flexDirection === "row-reverse")
  ) {
    allow("flex_wrap", "nowrap");
    // Elementor applies --flex-wrap-mobile independently; keep nowrap there too.
    if (suffix === "") {
      setIfAllowed(
        catalog,
        widgetId,
        settings,
        "flex_wrap",
        "nowrap",
        true,
        "_mobile",
      );
    }
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
  if (pad) {
    allow(`${spacingPrefix}padding`, pad);
  } else if (widgetId === "container" && suffix === "") {
    // Elementor Free containers default to ~10px padding via CSS variables.
    // Emit explicit 0 when the source has no padding so chrome wrappers do not
    // invent vertical/horizontal empty space.
    allow(
      `${spacingPrefix}padding`,
      {
        unit: "px",
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
        isLinked: true,
      },
      false,
    );
  }

  const margin = toDimensionsFromSides({
    all: style.box?.margin,
    top: style.box?.marginTop,
    right: style.box?.marginRight,
    bottom: style.box?.marginBottom,
    left: style.box?.marginLeft,
  });
  allow(`${spacingPrefix}margin`, margin);

  if (style.box?.width) {
    if (style.box.width === "auto" || style.box.width === "fit-content") {
      // Free leaf widgets: hug content instead of 100% grow in flex rows.
      allow("_element_width", "auto", false);
    } else {
      allow("width", toSlider(style.box.width));
      allow("_element_custom_width", toSlider(style.box.width));
    }
  }
  if (style.box?.maxWidth) {
    if (widgetId === "image") {
      // Image `space` control is max-width related.
      allow("space", toSlider(style.box.maxWidth));
    } else if (widgetId === "container") {
      // Prefer full-width container + CSS max-width semantics.
      // Elementor `content_width: boxed` creates an outer full-width shell plus
      // `.e-con-inner` (and forces column on the shell), which reads as an extra
      // empty container around header chrome and double-shrinks nested bars.
      allow("content_width", "full", false);
      allow(
        "width",
        {
          size: `min(100%, ${style.box.maxWidth})`,
          unit: "custom",
        },
        false,
      );
    } else {
      allow("content_width", "boxed", false);
      allow("boxed_width", toSlider(style.box.maxWidth));
    }
  }
  if (style.box?.minHeight) {
    allow("min_height", toSlider(style.box.minHeight));
  }
  if (style.box?.height) {
    if (widgetId === "image") {
      // Prefer Image height control so intrinsic asset dimensions do not win.
      allow("height", toSlider(style.box.height));
    } else if (widgetId === "spacer") {
      allow("space", toSlider(style.box.height));
    } else {
      allow("min_height", toSlider(style.box.height));
    }
  }
  // max-h-* without explicit height: constrain Image height so intrinsic
  // asset pixels do not dominate chrome (logos).
  if (
    widgetId === "image" &&
    style.box?.maxHeight &&
    style.box.maxHeight !== "none" &&
    !style.box?.height
  ) {
    allow("height", toSlider(style.box.maxHeight));
  }
  if (widgetId === "image" && style.box?.objectFit) {
    const fit = style.box.objectFit;
    if (
      fit === "fill" ||
      fit === "cover" ||
      fit === "contain" ||
      fit === "scale-down"
    ) {
      allow("object-fit", fit);
    }
  }
  if (widgetId === "image" && style.box?.objectPosition) {
    allow("object-position", style.box.objectPosition);
  }
  // shrink-0 / grow-0 → hug content when Free has no flex-shrink control.
  if (
    style.layout?.flexShrink === "0" ||
    style.layout?.flexGrow === "0"
  ) {
    allow("_element_width", "auto", false);
  }

  // Background
  if (style.background?.color && !/gradient\(/i.test(style.background.color)) {
    allow(`${bgPrefix}background_background`, "classic", false);
    allow(`${bgPrefix}background_color`, style.background.color, false);
  }
  if (style.background?.image) {
    const urlMatch = style.background.image.match(
      /^url\(\s*['"]?([^'")]+)['"]?\s*\)$/i,
    );
    if (urlMatch) {
      allow(`${bgPrefix}background_background`, "classic", false);
      allow(
        `${bgPrefix}background_image`,
        { url: urlMatch[1], id: "", source: "url" },
        false,
      );
    }
  }
  if (style.background?.size) {
    allow(`${bgPrefix}background_size`, style.background.size, false);
  }
  if (style.background?.position) {
    allow(`${bgPrefix}background_position`, style.background.position, false);
  }
  if (style.background?.repeat) {
    allow(`${bgPrefix}background_repeat`, style.background.repeat, false);
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
  if (style.typography?.lineHeight) {
    allow("typography_line_height", toSlider(style.typography.lineHeight));
  }
  if (style.typography?.letterSpacing) {
    allow(
      "typography_letter_spacing",
      toSlider(style.typography.letterSpacing),
    );
  }
  if (style.typography?.textAlign) {
    // Catalog-gated: heading/button expose `align`; Free container has no text-align control.
    allow("align", mapAlign(style.typography.textAlign));
  }

  // Position — Free Container uses `position` / `z_index`; leaf widgets use
  // common-base `_position` / `_z_index`. Catalog-gate both forms.
  if (
    style.position?.position === "absolute" ||
    style.position?.position === "fixed"
  ) {
    allow("position", style.position.position, false);
    allow("_position", style.position.position, false);
    // Fixed/absolute chrome must span the viewport like CSS inset-x-0 / width 100%.
    if (widgetId === "container") {
      allow("content_width", "full", false);
      if (settings.width == null) {
        allow("width", { size: 100, unit: "%" }, false);
      }
    }
  }
  if (style.position?.zIndex) {
    const n = Number(style.position.zIndex);
    if (!Number.isNaN(n)) {
      allow("z_index", n);
      allow("_z_index", n);
    }
  }
  // Simple sticky-header offsets when Elementor offset sliders are catalogued.
  if (style.position?.top === "0px" || style.position?.top === "0") {
    allow("_offset_y", { size: 0, unit: "px" });
  }
  if (style.position?.left === "0px" || style.position?.left === "0") {
    allow("_offset_x", { size: 0, unit: "px" });
  }

  // Effects
  if (style.effects?.opacity) {
    // not always in catalog for every widget — only set if allowed
    allow("opacity", style.effects.opacity, false);
  }
  if (style.effects?.boxShadow) {
    const shadow = toBoxShadow(style.effects.boxShadow);
    if (shadow) {
      // Widget-specific Group_Control_Box_Shadow ids (catalog-gated via allow)
      allow("box_shadow_box_shadow", shadow, false);
      allow("button_box_shadow_box_shadow", shadow, false);
      allow("image_box_shadow_box_shadow", shadow, false);
      allow("_box_shadow_box_shadow", shadow, false);
    }
  }
}

/**
 * Map full IrStyle including responsive overrides into Elementor settings.
 * IR responsive keys are mobile-first; Elementor suffixes are desktop-first.
 */
export function mapIrStyleToSettings(
  style: IrStyle | undefined,
  ctx: StyleMapContext,
): ElementorSettings {
  const settings: ElementorSettings = {};
  if (!style) return settings;

  const tiers = cascadeMobileFirstToElementorTiers(style);
  applyIrStyleSlice(tiers.desktop, ctx, settings, "");
  if (tiers.tablet) {
    applyIrStyleSlice(tiers.tablet, ctx, settings, "_tablet");
  }
  if (tiers.mobile) {
    applyIrStyleSlice(tiers.mobile, ctx, settings, "_mobile");
  }

  // CSS/Tailwind grid without base `grid-cols-*` is one column. When columns
  // only appear at a breakpoint, Elementor would otherwise inherit desktop
  // columns onto mobile — emit explicit mobile = 1 to preserve stacked base.
  const baseHadColumns = Boolean(style.layout?.gridTemplateColumns);
  const responsiveHadColumns = Object.values(style.responsive ?? {}).some(
    (partial) => Boolean(partial?.layout?.gridTemplateColumns),
  );
  if (
    !baseHadColumns &&
    responsiveHadColumns &&
    settings.container_type === "grid" &&
    settings.grid_columns_grid_mobile === undefined &&
    (settings.grid_columns_grid !== undefined ||
      settings.grid_columns_grid_tablet !== undefined)
  ) {
    setIfAllowed(
      ctx.catalog,
      ctx.widgetId,
      settings,
      "grid_columns_grid",
      { unit: "fr", size: 1 },
      true,
      "_mobile",
    );
  }

  applyResponsiveVisibilityHides(style, tiers, ctx, settings);

  return settings;
}

/**
 * Map Tailwind/CSS display:none (+ responsive show) to Free hide_* switchers.
 *
 * Examples (mobile-first IR → Elementor desktop-first hides):
 * - `hidden lg:flex` → hide_mobile + hide_tablet
 * - `flex lg:hidden` → hide_desktop
 * - `hidden md:flex` → hide_mobile
 */
export function applyResponsiveVisibilityHides(
  style: IrStyle,
  tiers: CascadedTiers,
  ctx: StyleMapContext,
  settings: ElementorSettings,
): void {
  const desktopDisplay = tiers.desktop.layout?.display;
  const tabletDisplay = tiers.tablet?.layout?.display;
  const mobileDisplay = tiers.mobile?.layout?.display;

  const hasResponsiveDisplay = Object.values(style.responsive ?? {}).some(
    (partial) => partial?.layout?.display !== undefined,
  );
  const baseDisplay = style.layout?.display;

  // Always-hidden (no responsive re-show): hide on every device.
  if (baseDisplay === "none" && !hasResponsiveDisplay) {
    setHide(ctx, settings, "hide_desktop");
    setHide(ctx, settings, "hide_tablet");
    setHide(ctx, settings, "hide_mobile");
    return;
  }

  // Only emit hides when display participates in a responsive visibility pattern.
  if (!hasResponsiveDisplay && baseDisplay !== "none") {
    return;
  }

  if (desktopDisplay === "none") {
    setHide(ctx, settings, "hide_desktop");
  }
  // Tablet: explicit cascaded none, or inherit base none when desktop shows via lg+.
  if (
    tabletDisplay === "none" ||
    (tabletDisplay === undefined &&
      baseDisplay === "none" &&
      desktopDisplay !== undefined &&
      desktopDisplay !== "none")
  ) {
    setHide(ctx, settings, "hide_tablet");
  }
  if (
    mobileDisplay === "none" ||
    (mobileDisplay === undefined &&
      baseDisplay === "none" &&
      hasResponsiveDisplay)
  ) {
    setHide(ctx, settings, "hide_mobile");
  }
}

function setHide(
  ctx: StyleMapContext,
  settings: ElementorSettings,
  id: "hide_desktop" | "hide_tablet" | "hide_mobile",
): void {
  if (!canUseControl(ctx.catalog, ctx.widgetId, id)) return;
  // Elementor SWITCHER return_value is "hidden-{device}" → class elementor-hidden-{device}.
  const device = id.replace("hide_", "");
  settings[id] = `hidden-${device}`;
}
