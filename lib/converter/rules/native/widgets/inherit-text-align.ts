import type { IrNode, IrStyle } from "../../../ir/schema";
import { mergeIrStyles } from "../../../styles/declarations";

/**
 * Free Elementor Container has no native `align` / text-align control.
 * When a parent container's resolved style includes typography.textAlign,
 * CSS would inherit that onto typographic descendants. Propagate the same
 * into Heading / Text Editor (and intermediate containers for pass-through)
 * so Free widgets that expose `align` can emit it.
 *
 * Child-owned textAlign at any breakpoint wins entirely (no partial inherit).
 */

const PASS_THROUGH_KINDS = new Set(["heading", "text", "container", "group"]);

function extractTextAlignStyle(style: IrStyle | undefined): IrStyle | undefined {
  if (!style) return undefined;
  const out: IrStyle = {};
  if (style.typography?.textAlign) {
    out.typography = { textAlign: style.typography.textAlign };
  }
  if (style.responsive) {
    for (const [bp, partial] of Object.entries(style.responsive)) {
      const align = partial?.typography?.textAlign;
      if (!align) continue;
      out.responsive ??= {};
      out.responsive[bp] = { typography: { textAlign: align } };
    }
  }
  return out.typography || out.responsive ? out : undefined;
}

function hasOwnTextAlign(style: IrStyle | undefined): boolean {
  return Boolean(extractTextAlignStyle(style));
}

/**
 * Return a shallow-cloned child with parent textAlign merged in when
 * this node should inherit and does not already set textAlign itself.
 */
export function withInheritedParentTextAlign(
  parentStyle: IrStyle | undefined,
  child: IrNode,
): IrNode {
  if (!PASS_THROUGH_KINDS.has(child.kind)) return child;
  const inherited = extractTextAlignStyle(parentStyle);
  if (!inherited) return child;
  if (hasOwnTextAlign(child.style)) return child;
  return {
    ...child,
    style: mergeIrStyles(inherited, child.style),
  };
}

export function shouldPropagateContainerTextAlign(
  catalogHasContainerAlign: boolean,
  parentStyle: IrStyle | undefined,
): boolean {
  return !catalogHasContainerAlign && Boolean(extractTextAlignStyle(parentStyle));
}
