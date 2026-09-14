import type { IrNode, IrStyle } from "../../../ir/schema";
import { isVisuallyHiddenNode } from "./image-like-link";

/**
 * Detect whether an IR `link` is visually a CTA/button chrome rather than a
 * plain navigation/text link.
 *
 * Uses resolved style facts only (no label heuristics). Conservative: ambiguous
 * anchors stay links so Free Button is not forced on normal `<a>`s.
 *
 * Named icon + text children (e.g. Phone glyph beside a label) may still map to
 * Free Button with `selected_icon` when chrome signals are present.
 */

export type ButtonLikeFlatten = {
  text: string;
  iconName?: string;
};

/**
 * Flatten link children that are only text and/or a single named icon.
 * Returns null when structure is too rich for Free Button text+icon.
 */
export function flattenButtonLikeLinkContent(
  node: IrNode & { kind: "link" },
): ButtonLikeFlatten | null {
  const visible = node.children.filter((c) => !isVisuallyHiddenNode(c));
  if (visible.length === 0) {
    const text = node.props.text?.trim();
    return text ? { text } : null;
  }

  const textParts: string[] = [];
  let iconName: string | undefined;

  for (const child of visible) {
    if (child.kind === "text") {
      const t = child.props.text?.trim();
      if (t) textParts.push(t);
      continue;
    }
    if (child.kind === "icon" && child.props.name?.trim()) {
      if (iconName) return null;
      iconName = child.props.name.trim();
      continue;
    }
    // Trivial wrapper holding only text (e.g. <span>{label}</span>).
    if (
      (child.kind === "container" || child.kind === "group") &&
      child.children.length > 0
    ) {
      const inner = child.children.filter((c) => !isVisuallyHiddenNode(c));
      if (
        inner.length > 0 &&
        inner.every((c) => c.kind === "text")
      ) {
        for (const t of inner) {
          const s = t.kind === "text" ? t.props.text?.trim() : "";
          if (s) textParts.push(s);
        }
        continue;
      }
    }
    return null;
  }

  const fromProps = node.props.text?.trim();
  const text = (fromProps || textParts.join(" ").replace(/\s+/g, " ").trim()).trim();
  if (!text) return null;
  return { text, ...(iconName ? { iconName } : {}) };
}

export function isButtonLikeLink(node: IrNode): boolean {
  if (node.kind !== "link") return false;
  const flat = flattenButtonLikeLinkContent(node);
  if (!flat?.text) return false;

  const slices: IrStyle[] = [node.style ?? {}];
  if (node.style?.responsive) {
    for (const partial of Object.values(node.style.responsive)) {
      if (partial) slices.push(partial);
    }
  }

  let hasFill = false;
  let hasBoxBorder = false;
  let hasPadding = false;
  let support = 0;

  for (const slice of slices) {
    if (hasOpaqueBackground(slice.background?.color)) {
      hasFill = true;
    }
    if (isBoxBorder(slice.border)) {
      hasBoxBorder = true;
    }
    if (hasButtonPadding(slice.box)) {
      hasPadding = true;
    }
    if (slice.border?.radius) support += 1;
    const weight = Number(slice.typography?.fontWeight);
    if (Number.isFinite(weight) && weight >= 600) support += 1;
    if (slice.typography?.textAlign === "center") support += 1;
    const display = slice.layout?.display;
    if (
      display === "inline-block" ||
      display === "inline-flex" ||
      display === "flex"
    ) {
      support += 1;
    }
  }

  // Require button chrome: padding plus a filled or outlined box.
  // Supporting signals alone (weight / inline-block) are not enough.
  if (!(hasPadding && (hasFill || hasBoxBorder))) {
    return false;
  }

  // Filled+padded or outlined+padded is enough; extra support helps confidence
  // but is not required when both chrome signals are present.
  void support;
  return true;
}

function hasOpaqueBackground(color: string | undefined): boolean {
  if (!color) return false;
  const c = color.trim().toLowerCase();
  return c !== "transparent" && c !== "rgba(0, 0, 0, 0)" && c !== "rgba(0,0,0,0)";
}

/** True when padding forms a clickable box (shorthand or X+Y sides). */
function hasButtonPadding(
  box: IrStyle["box"] | undefined,
): boolean {
  if (!box) return false;
  if (box.padding) return true;
  const hasX = Boolean(box.paddingLeft || box.paddingRight);
  const hasY = Boolean(box.paddingTop || box.paddingBottom);
  return hasX && hasY;
}

/**
 * Full/near-full box border — not a single-side underline (`border-b`).
 */
function isBoxBorder(border: IrStyle["border"] | undefined): boolean {
  if (!border?.width) return false;
  if (border.style === "none") return false;
  const width = border.width.trim();
  if (!width || width === "0" || width === "0px") return false;

  const parts = width.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return (parseFloat(parts[0]!) || 0) > 0;
  }
  if (parts.length === 2) {
    // vertical horizontal — treat as box if either axis > 0
    return parts.some((p) => (parseFloat(p) || 0) > 0);
  }
  if (parts.length >= 3) {
    const nums = parts.map((p) => parseFloat(p) || 0);
    const nonzero = nums.filter((n) => n > 0).length;
    // Require 3+ sides (or all four) so `0 0 1px 0` underline does not qualify.
    return nonzero >= 3;
  }
  return false;
}

/** Adapt a link IR node into the button shape expected by `convertButton`. */
export function linkNodeAsButton(
  node: IrNode & { kind: "link" },
): IrNode & { kind: "button" } {
  const flat = flattenButtonLikeLinkContent(node);
  return {
    ...node,
    kind: "button",
    children: [],
    props: {
      text: flat?.text ?? node.props.text ?? "",
      href: node.props.href,
      type: "link",
      ...(node.props.target ? { target: node.props.target } : {}),
      ...(node.props.rel ? { rel: node.props.rel } : {}),
      ...(flat?.iconName ? { iconName: flat.iconName } : {}),
    },
    notes: [
      ...(node.notes ?? []),
      "button-like-link",
      ...(flat?.iconName ? ["button-like-link-icon"] : []),
    ],
  };
}
