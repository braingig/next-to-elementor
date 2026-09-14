/**
 * Detect when Free native widgets/controls cannot accurately represent an IR node.
 * Escalation target is node-scoped Free HTML custom fallback (not silent approximation).
 */

import type { IrNode, IrStyle } from "../../ir/schema";
import type { UnsupportedReasonCode } from "../../types/decisions";
import { toGridColumns, toBoxShadow } from "../native/styles/values";

export type NativeFidelityGap = {
  reasonCode: UnsupportedReasonCode;
  message: string;
};

function styleHasGradientBackground(style: IrStyle | undefined): boolean {
  if (!style?.background) return false;
  const color = style.background.color ?? "";
  const image = style.background.image ?? "";
  return /gradient\(/i.test(color) || /gradient\(/i.test(image);
}

function styleHasTransform(style: IrStyle | undefined): boolean {
  return Boolean(style?.effects?.transform);
}

function styleHasUnsupportedGrid(style: IrStyle | undefined): boolean {
  const raw = style?.layout?.gridTemplateColumns;
  if (!raw) return false;
  return toGridColumns(raw) == null;
}

function styleHasMultiLayerShadow(style: IrStyle | undefined): boolean {
  const shadow = style?.effects?.boxShadow;
  if (!shadow || shadow === "none") return false;
  if (/\binset\b/i.test(shadow)) return true;
  const layers = shadow
    .split(/,(?![^(]*\))/)
    .map((s) => s.trim())
    .filter(Boolean);
  // Curated Tailwind sm/md/lg/xl use 2 layers; Free maps the first. Escalate
  // only when 3+ layers (clear visual loss) or inset (unmapped).
  return layers.length >= 3;
}

function styleHasNonTrivialInsets(style: IrStyle | undefined): boolean {
  if (!style?.position) return false;
  const pos = style.position.position;
  if (pos !== "absolute" && pos !== "fixed") return false;
  const sides = [
    style.position.top,
    style.position.right,
    style.position.bottom,
    style.position.left,
  ];
  // inset-0 / all zeros is often absorbable (cover); other insets need CSS.
  const meaningful = sides.filter((v) => v != null && v !== "" && v !== "0" && v !== "0px");
  return meaningful.length > 0;
}

function styleHasComplexResponsiveLayout(style: IrStyle | undefined): boolean {
  if (!style?.responsive) return false;
  const bps = Object.keys(style.responsive);
  // Elementor only has 3 tiers. When source has layout changes at sm+xl without
  // md (or 4+ breakpoints with layout facts), native cascade is lossy.
  const layoutBps = bps.filter((bp) => {
    const partial = style.responsive?.[bp];
    return Boolean(
      partial?.layout?.flexDirection ||
        partial?.layout?.display ||
        partial?.layout?.gridTemplateColumns ||
        partial?.layout?.justifyContent ||
        partial?.layout?.gap ||
        partial?.layout?.alignItems,
    );
  });
  if (layoutBps.length >= 3) return true;
  const hasSm = layoutBps.includes("sm");
  const hasXlOr2xl = layoutBps.includes("xl") || layoutBps.includes("2xl");
  const hasMd = layoutBps.includes("md");
  if (hasSm && hasXlOr2xl && !hasMd) return true;
  // Unsupported grid at any responsive tier
  for (const bp of bps) {
    if (styleHasUnsupportedGrid(style.responsive?.[bp])) return true;
  }
  return false;
}

function styleHasFixedOverlay(style: IrStyle | undefined): boolean {
  if (!style?.position) return false;
  const pos = style.position.position;
  if (pos !== "fixed" && pos !== "absolute") return false;
  // Full-bleed / chrome overlays (inset-x / inset-0 / top+left+right) cannot be
  // faithfully reproduced by Free native containers in document flow.
  const hasHorizontalSpan =
    (style.position.left != null && style.position.right != null) ||
    style.position.left === "0px" ||
    style.position.right === "0px";
  const hasTop = style.position.top != null;
  const hasZ = style.position.zIndex != null;
  if (pos === "fixed") return true;
  return hasHorizontalSpan && (hasTop || hasZ);
}

function walkStyleGaps(style: IrStyle | undefined): NativeFidelityGap | null {
  if (!style) return null;

  if (styleHasFixedOverlay(style)) {
    return {
      reasonCode: "layout-unsupported",
      message:
        "Fixed/absolute overlay positioning with inset/z-index cannot be represented accurately by Free native containers; using node-scoped HTML fallback.",
    };
  }
  // backdrop-filter needs scoped CSS. `isolation` alone must NOT escalate — it is
  // a stacking-context hint commonly applied to large sections; escalating would
  // absorb native headings/text/buttons into one HTML widget (parent contamination).
  if (style.effects?.backdropFilter) {
    return {
      reasonCode: "native-mapping-unavailable",
      message:
        "backdrop-filter cannot be represented by Free native controls; using node-scoped HTML fallback.",
    };
  }
  if (styleHasTransform(style)) {
    return {
      reasonCode: "native-mapping-unavailable",
      message:
        "CSS transform cannot be represented accurately by Free native controls; using node-scoped HTML fallback.",
    };
  }
  if (styleHasUnsupportedGrid(style)) {
    return {
      reasonCode: "layout-unsupported",
      message:
        "Unequal or arbitrary CSS grid tracks cannot be represented accurately by Free equal-fr grid controls; using node-scoped HTML fallback.",
    };
  }
  if (styleHasGradientBackground(style)) {
    return {
      reasonCode: "native-mapping-unavailable",
      message:
        "Gradient / complex backgrounds cannot be represented accurately by Free native color controls; using node-scoped HTML fallback.",
    };
  }
  if (styleHasMultiLayerShadow(style)) {
    return {
      reasonCode: "native-mapping-unavailable",
      message:
        "Multi-layer box-shadow cannot be represented accurately by a single Free box-shadow control; using node-scoped HTML fallback.",
    };
  }
  if (styleHasComplexResponsiveLayout(style)) {
    return {
      reasonCode: "responsive-unsupported",
      message:
        "Responsive layout overrides cannot be represented faithfully with Elementor Free's three breakpoint tiers; using node-scoped HTML fallback with media queries.",
    };
  }

  // Also scan nested responsive style slices for transform / gradient / shadow.
  if (style.responsive) {
    for (const bp of Object.keys(style.responsive)) {
      const partial = style.responsive[bp];
      if (styleHasTransform(partial)) {
        return {
          reasonCode: "native-mapping-unavailable",
          message:
            "Responsive CSS transform cannot be represented accurately by Free native controls; using node-scoped HTML fallback.",
        };
      }
      if (styleHasGradientBackground(partial)) {
        return {
          reasonCode: "native-mapping-unavailable",
          message:
            "Responsive gradient backgrounds cannot be represented accurately by Free native controls; using node-scoped HTML fallback.",
        };
      }
      if (styleHasMultiLayerShadow(partial)) {
        return {
          reasonCode: "native-mapping-unavailable",
          message:
            "Responsive multi-layer box-shadow cannot be represented accurately by Free native controls; using node-scoped HTML fallback.",
        };
      }
    }
  }

  return null;
}

/**
 * Node-local style facts that Free native cannot map accurately.
 */
export function detectNativeFidelityGap(node: IrNode): NativeFidelityGap | null {
  if (node.kind === "unsupported") return null;
  return walkStyleGaps(node.style);
}

/**
 * Paint-only gaps: the node's own fill/effects cannot be native, but descendants
 * do not need to live inside the same HTML widget for layout correctness.
 * Used to peel a decorative layer instead of absorbing the whole subtree.
 */
export function isSelfPaintOnlyFidelityGap(
  gap: NativeFidelityGap | null | undefined,
): boolean {
  if (!gap) return false;
  const m = gap.message;
  return (
    m.includes("Gradient / complex backgrounds") ||
    m.includes("Responsive gradient backgrounds") ||
    m.includes("backdrop-filter") ||
    m.includes("Multi-layer box-shadow") ||
    m.includes("Responsive multi-layer box-shadow")
  );
}

function styleSliceHasSelfPaint(style: IrStyle | undefined): boolean {
  if (!style) return false;
  return (
    styleHasGradientBackground(style) ||
    Boolean(style.effects?.backdropFilter) ||
    styleHasMultiLayerShadow(style)
  );
}

/**
 * Split unmappable self-paint (gradient / backdrop / multi-shadow) onto an
 * absolute inset decorative sibling so the parent can stay a native container
 * with native-convertible children (smallest custom boundary).
 *
 * Returns null when peeling is not applicable.
 */
export function peelSelfPaintForHybrid(node: IrNode): {
  contentNode: IrNode;
  paintNode: IrNode;
} | null {
  if (node.kind !== "container" && node.kind !== "group") return null;
  if (node.children.length === 0) return null;
  if (!styleSliceHasSelfPaint(node.style)) return null;
  // Positioned chrome / transforms require the node itself as the custom root.
  if (styleHasFixedOverlay(node.style) || styleHasTransform(node.style)) {
    return null;
  }
  if (styleHasUnsupportedGrid(node.style)) return null;

  const src = node.style ?? {};
  const paintBackground: NonNullable<IrStyle["background"]> = {};
  const contentBackground: NonNullable<IrStyle["background"]> = {
    ...(src.background ?? {}),
  };

  if (styleHasGradientBackground(src)) {
    const color = src.background?.color ?? "";
    const image = src.background?.image ?? "";
    if (/gradient\(/i.test(color)) {
      paintBackground.color = color;
      delete contentBackground.color;
    }
    if (/gradient\(/i.test(image)) {
      paintBackground.image = image;
      delete contentBackground.image;
    }
    // Decorative fills should cover the box.
    if (src.background?.size) paintBackground.size = src.background.size;
    if (src.background?.position) {
      paintBackground.position = src.background.position;
    }
    if (src.background?.repeat) paintBackground.repeat = src.background.repeat;
  }

  const paintEffects: NonNullable<IrStyle["effects"]> = {};
  const contentEffects: NonNullable<IrStyle["effects"]> = {
    ...(src.effects ?? {}),
  };
  if (src.effects?.backdropFilter) {
    paintEffects.backdropFilter = src.effects.backdropFilter;
    delete contentEffects.backdropFilter;
  }
  if (styleHasMultiLayerShadow(src)) {
    paintEffects.boxShadow = src.effects!.boxShadow;
    delete contentEffects.boxShadow;
  }

  const paintStyle: IrStyle = {
    position: {
      position: "absolute",
      top: "0px",
      right: "0px",
      bottom: "0px",
      left: "0px",
      zIndex: "-1",
    },
    layout: { pointerEvents: "none" },
    ...(Object.keys(paintBackground).length > 0
      ? { background: paintBackground }
      : {}),
    ...(Object.keys(paintEffects).length > 0 ? { effects: paintEffects } : {}),
  };

  const contentStyle: IrStyle = { ...src };
  if (Object.keys(contentBackground).length > 0) {
    contentStyle.background = contentBackground;
  } else {
    delete contentStyle.background;
  }
  if (Object.keys(contentEffects).length > 0) {
    contentStyle.effects = contentEffects;
  } else {
    delete contentStyle.effects;
  }
  // Ensure absolute paint layer is positioned against this box.
  contentStyle.position = {
    ...(contentStyle.position ?? {}),
    position: contentStyle.position?.position ?? "relative",
  };

  // Also peel responsive paint slices so the content node no longer gaps.
  if (contentStyle.responsive) {
    const nextResponsive: NonNullable<IrStyle["responsive"]> = {
      ...contentStyle.responsive,
    };
    for (const bp of Object.keys(nextResponsive)) {
      const partial = nextResponsive[bp];
      if (!partial || !styleSliceHasSelfPaint(partial)) continue;
      const cleaned = { ...partial };
      if (styleHasGradientBackground(partial)) {
        const bg = { ...(partial.background ?? {}) };
        if (/gradient\(/i.test(bg.color ?? "")) delete bg.color;
        if (/gradient\(/i.test(bg.image ?? "")) delete bg.image;
        if (Object.keys(bg).length > 0) cleaned.background = bg;
        else delete cleaned.background;
      }
      if (partial.effects?.backdropFilter || styleHasMultiLayerShadow(partial)) {
        const fx = { ...(partial.effects ?? {}) };
        delete fx.backdropFilter;
        if (styleHasMultiLayerShadow(partial)) delete fx.boxShadow;
        if (Object.keys(fx).length > 0) cleaned.effects = fx;
        else delete cleaned.effects;
      }
      nextResponsive[bp] = cleaned;
    }
    contentStyle.responsive = nextResponsive;
  }

  const paintNode: IrNode = {
    id: `${node.id}__paint`,
    kind: "container",
    props: {},
    style: paintStyle,
    provenance: {
      htmlTag: "div",
      classNames: [],
      attributes: { "aria-hidden": "true" },
      ...(node.provenance?.sourcePath
        ? { sourcePath: node.provenance.sourcePath }
        : {}),
    },
    children: [],
  };

  const contentNode: IrNode = {
    ...node,
    style: contentStyle,
  };

  // Peeling must clear self-paint on the content node.
  if (styleSliceHasSelfPaint(contentNode.style)) return null;

  return { contentNode, paintNode };
}

/**
 * After full-bleed absorb: remaining *absolute* layer stacks with no in-flow
 * siblings may need a custom containing block.
 *
 * Important boundaries (hybrid conversion):
 * - `position:fixed` children escalate node-locally (viewport-relative) and must
 *   NOT force the parent (often the page root) into one HTML widget.
 * - When in-flow siblings exist, keep the parent native and escalate only the
 *   absolute children via detectNativeFidelityGap — never absorb headings/text
 *   into a parent custom fallback solely because of decorative layers.
 */
export function detectAbsoluteClusterFidelityGap(
  remainingChildren: IrNode[],
): NativeFidelityGap | null {
  const absKids = remainingChildren.filter((c) => {
    return c.style?.position?.position === "absolute";
  });
  if (absKids.length === 0) return null;

  const inFlowSiblings = remainingChildren.filter((c) => {
    const pos = c.style?.position?.position;
    return pos !== "absolute" && pos !== "fixed";
  });
  // Hybrid: native parent + custom absolute children (smallest custom boundary).
  if (inFlowSiblings.length > 0) return null;

  // Pure absolute layer stack — parent custom is the smallest honest boundary.
  if (absKids.length >= 2) {
    return {
      reasonCode: "layout-unsupported",
      message:
        "Layered absolute children cannot be represented accurately by Free native containers; using node-scoped HTML fallback.",
    };
  }

  const only = absKids[0]!;
  if (styleHasNonTrivialInsets(only.style) || styleHasTransform(only.style)) {
    return {
      reasonCode: "layout-unsupported",
      message:
        "Absolutely positioned child with non-trivial insets/transform cannot be represented accurately by Free native controls; using node-scoped HTML fallback.",
    };
  }

  return null;
}

/** True when Free box-shadow mapping would silently drop layers or inset. */
export function boxShadowNeedsCustom(style: IrStyle | undefined): boolean {
  if (!style?.effects?.boxShadow) return false;
  if (styleHasMultiLayerShadow(style)) return true;
  const shadow = style.effects.boxShadow;
  if (/\binset\b/i.test(shadow)) return true;
  return toBoxShadow(shadow) == null && shadow !== "none";
}
