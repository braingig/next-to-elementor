/**
 * Absorb absolute full-bleed cover images + decorative overlays into Free
 * Container background / background_overlay settings.
 *
 * Festive-style pattern:
 *   <section className="relative …">
 *     <img className="absolute inset-0 h-full w-full object-cover" />
 *     <div className="absolute inset-0 bg-[linear-gradient(…)]" />
 *     <div className="relative">…content…</div>
 *   </section>
 */

import type { IrNode } from "../../../ir/schema";
import type { ElementorFreeCatalog } from "../../../catalog/schema";
import { canUseControl } from "../../../catalog/compliance";
import { canonicalizeCssColor } from "../../../styles/theme/color";
import { oklchToCssColor } from "../../../styles/theme/oklch";
import type { ElementorSettings } from "../types";
import type { NativeElementDraft, NativeEmit } from "./leaf";

function classSet(node: IrNode): Set<string> {
  return new Set(node.provenance?.classNames ?? []);
}

function isZeroLength(value: string | undefined): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "0" || v === "0px" || v === "0%" || v === "0rem" || v === "0em";
}

/** Absolute + inset-0 (classes or resolved top/right/bottom/left). */
export function isAbsolutelyInset(node: IrNode): boolean {
  const classes = classSet(node);
  const pos = node.style?.position;
  const absolute =
    pos?.position === "absolute" || classes.has("absolute");
  if (!absolute) return false;

  if (classes.has("inset-0")) return true;

  return (
    isZeroLength(pos?.top) &&
    isZeroLength(pos?.right) &&
    isZeroLength(pos?.bottom) &&
    isZeroLength(pos?.left)
  );
}

function hasCoverObjectFit(node: IrNode): boolean {
  const classes = classSet(node);
  if (classes.has("object-cover")) return true;
  // Mapped utilities may also leave full-box sizing cues.
  return (
    (classes.has("h-full") && classes.has("w-full")) ||
    (node.style?.box?.height === "100%" && node.style?.box?.width === "100%")
  );
}

/**
 * Absolute cover image that should become the parent container background.
 */
export function isFullBleedCoverImage(node: IrNode): boolean {
  if (node.kind !== "image") return false;
  if (!node.props.src || typeof node.props.src !== "string") return false;
  if (node.children.length > 0) return false;
  if (!isAbsolutelyInset(node)) return false;
  return hasCoverObjectFit(node);
}

function backgroundLooksLikeOverlayPaint(node: IrNode): boolean {
  const bg = node.style?.background;
  if (!bg) return false;
  if (bg.image && /gradient\(/i.test(bg.image)) return true;
  if (bg.color) {
    if (/gradient\(/i.test(bg.color)) return true;
    if (bg.color !== "transparent" && bg.color !== "rgba(0, 0, 0, 0)") {
      return true;
    }
  }
  return false;
}

/**
 * Empty absolute layer used only as a dark/gradient wash over the hero image.
 */
export function isFullBleedOverlayLayer(node: IrNode): boolean {
  if (node.kind !== "container" && node.kind !== "group") return false;
  if (node.children.length > 0) return false;
  if (!isAbsolutelyInset(node)) return false;
  return backgroundLooksLikeOverlayPaint(node);
}

function extractCssColorLiteral(raw: string): string | null {
  const trimmed = raw.trim();
  const oklch = trimmed.match(/oklch\([^)]+\)/i);
  if (oklch) {
    return oklchToCssColor(oklch[0]) ?? canonicalizeCssColor(oklch[0]);
  }
  const rgb = trimmed.match(/rgba?\([^)]+\)/i);
  if (rgb) return canonicalizeCssColor(rgb[0]) ?? rgb[0];
  const hex = trimmed.match(/#[0-9a-fA-F]{3,8}/);
  if (hex) return canonicalizeCssColor(hex[0]) ?? hex[0];
  return canonicalizeCssColor(trimmed);
}

/**
 * Pick Free classic overlay color + opacity from solid color or gradient stops.
 * Free applies `opacity: var(--overlay-opacity)` on the overlay ::before, so we
 * emit an opaque RGB/hex color and put the alpha in background_overlay_opacity.
 * Multi-stop gradients average stop alphas (classic overlay cannot preserve stops).
 */
export function resolveOverlayPaint(node: IrNode): {
  color: string;
  opacity: number;
} | null {
  const bg = node.style?.background;
  if (!bg) return null;

  const alphas: number[] = [];
  const positioned: Array<{ alpha: number; pos: number }> = [];
  let opaqueColor: string | null = null;

  for (const candidate of [bg.color, bg.image]) {
    if (!candidate) continue;
    if (/gradient\(/i.test(candidate)) {
      // Match color stops, optionally followed by a position (e.g. _45% or 45%).
      const stopRe =
        /(oklch\([^)]+\)|rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})(?:\s*_?(\d+(?:\.\d+)?)%)?/gi;
      let m: RegExpExecArray | null;
      while ((m = stopRe.exec(candidate)) !== null) {
        const parsed = parseCssColorWithAlpha(m[1]!);
        if (!parsed) continue;
        alphas.push(parsed.alpha);
        if (!opaqueColor) opaqueColor = parsed.opaque;
        if (m[2] != null) {
          positioned.push({ alpha: parsed.alpha, pos: Number(m[2]) });
        }
      }
      continue;
    }
    const parsed = parseCssColorWithAlpha(candidate);
    if (parsed) {
      alphas.push(parsed.alpha);
      if (!opaqueColor) opaqueColor = parsed.opaque;
    }
  }

  if (!opaqueColor || alphas.length === 0) return null;

  // Prefer the stop nearest mid-band (hero text sits around ~45–50%) when
  // the source gradient declares positions; otherwise average all stop alphas.
  let opacity: number;
  if (positioned.length > 0) {
    positioned.sort(
      (a, b) => Math.abs(a.pos - 50) - Math.abs(b.pos - 50),
    );
    opacity = positioned[0]!.alpha;
  } else {
    opacity =
      Math.round(
        (alphas.reduce((a, b) => a + b, 0) / alphas.length) * 1000,
      ) / 1000;
  }
  return { color: opaqueColor, opacity: Math.min(1, Math.max(0, opacity)) };
}

/** Prefer resolveOverlayPaint for emission; kept for color-only checks. */
export function resolveOverlayColor(node: IrNode): string | null {
  return resolveOverlayPaint(node)?.color ?? null;
}

function parseCssColorWithAlpha(
  raw: string,
): { opaque: string; alpha: number } | null {
  const literal = extractCssColorLiteral(raw);
  if (!literal) return null;
  return splitCssColorAlpha(literal);
}

function splitCssColorAlpha(
  css: string,
): { opaque: string; alpha: number } | null {
  const rgba = css.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgba) {
    const r = Math.round(Number(rgba[1]));
    const g = Math.round(Number(rgba[2]));
    const b = Math.round(Number(rgba[3]));
    const alpha = rgba[4] != null ? Number(rgba[4]) : 1;
    return { opaque: `rgb(${r}, ${g}, ${b})`, alpha };
  }
  const hex = css.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 8) {
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const alpha = parseInt(h.slice(6, 8), 16) / 255;
      return { opaque: `rgb(${r}, ${g}, ${b})`, alpha };
    }
    if (h.length === 4) {
      const r = parseInt(h[0]! + h[0]!, 16);
      const g = parseInt(h[1]! + h[1]!, 16);
      const b = parseInt(h[2]! + h[2]!, 16);
      const alpha = parseInt(h[3]! + h[3]!, 16) / 255;
      return { opaque: `rgb(${r}, ${g}, ${b})`, alpha };
    }
    return { opaque: css, alpha: 1 };
  }
  return { opaque: css, alpha: 1 };
}

function allowSetting(
  catalog: ElementorFreeCatalog,
  settings: ElementorSettings,
  key: string,
  value: unknown,
): void {
  if (!canUseControl(catalog, "container", key)) return;
  settings[key] = value as ElementorSettings[string];
}

export type AbsorbFullBleedResult = {
  children: NativeElementDraft[];
  childDecisions: NativeEmit["decision"][];
  absorbedImage: boolean;
  absorbedOverlay: boolean;
};

/**
 * Promote matching IR children into container background settings and drop
 * their emitted Elementor elements (content stays above via remaining kids).
 */
export function absorbFullBleedBackground(args: {
  parent: IrNode;
  catalog: ElementorFreeCatalog;
  settings: ElementorSettings;
  irChildren: IrNode[];
  emits: NativeEmit[];
}): AbsorbFullBleedResult {
  const { catalog, settings, irChildren, emits } = args;
  const childDecisions = emits.map((e) => e.decision);
  const keep = new Array(irChildren.length).fill(true);
  let absorbedImage = false;
  let absorbedOverlay = false;

  // Prefer the first full-bleed cover image.
  for (let i = 0; i < irChildren.length; i++) {
    const child = irChildren[i]!;
    if (!isFullBleedCoverImage(child)) continue;
    if (settings.background_image) break;

    const src = child.props.src as string;
    allowSetting(catalog, settings, "background_background", "classic");
    allowSetting(catalog, settings, "background_image", {
      url: src,
      id: "",
      alt: typeof child.props.alt === "string" ? child.props.alt : "",
      source: "url",
    });
    allowSetting(catalog, settings, "background_size", "cover");
    allowSetting(catalog, settings, "background_position", "center center");
    allowSetting(catalog, settings, "background_repeat", "no-repeat");

    keep[i] = false;
    absorbedImage = true;
    childDecisions[i] = {
      nodeId: child.id,
      irKind: child.kind,
      strategy: "native",
      elementorType: "container",
      message:
        "Absorbed absolute cover image into parent Free Container background_image (cover).",
    };
    break;
  }

  // Prefer the first empty absolute overlay layer — only when this container
  // also has a cover background (hero / card media pattern). Otherwise an
  // overlay on a content container would wash the whole section incorrectly.
  const hasCoverBackground = Boolean(settings.background_image);
  if (hasCoverBackground) {
    for (let i = 0; i < irChildren.length; i++) {
      if (!keep[i]) continue;
      const child = irChildren[i]!;
      if (!isFullBleedOverlayLayer(child)) continue;
      if (
        settings.background_overlay_color ||
        settings.background_overlay_background
      ) {
        break;
      }

      const paint = resolveOverlayPaint(child);
      if (!paint) continue;

      allowSetting(catalog, settings, "background_overlay_background", "classic");
      allowSetting(catalog, settings, "background_overlay_color", paint.color);
      // Elementor multiplies overlay ::before opacity with this slider (default 0.5).
      allowSetting(catalog, settings, "background_overlay_opacity", {
        unit: "px",
        size: paint.opacity,
      });

      keep[i] = false;
      absorbedOverlay = true;
      childDecisions[i] = {
        nodeId: child.id,
        irKind: child.kind,
        strategy: "native",
        elementorType: "container",
        message:
          "Absorbed absolute overlay layer into parent Free Container background_overlay.",
      };
      break;
    }
  }

  const children = emits
    .map((e, i) => (keep[i] ? e.element : undefined))
    .filter((el): el is NativeElementDraft => Boolean(el));

  return {
    children,
    childDecisions,
    absorbedImage,
    absorbedOverlay,
  };
}
