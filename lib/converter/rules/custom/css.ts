import type { IrNode, IrStyle } from "../../ir/schema";
import { elementorIdFromIrId } from "../native/types";

const STYLE_PROP_MAP: Array<{
  path: (s: IrStyle) => string | undefined;
  css: string;
}> = [
  { path: (s) => s.layout?.display, css: "display" },
  { path: (s) => s.layout?.flexDirection, css: "flex-direction" },
  { path: (s) => s.layout?.flexWrap, css: "flex-wrap" },
  { path: (s) => s.layout?.justifyContent, css: "justify-content" },
  { path: (s) => s.layout?.alignItems, css: "align-items" },
  { path: (s) => s.layout?.alignContent, css: "align-content" },
  { path: (s) => s.layout?.gap, css: "gap" },
  { path: (s) => s.layout?.rowGap, css: "row-gap" },
  { path: (s) => s.layout?.columnGap, css: "column-gap" },
  { path: (s) => s.layout?.gridTemplateColumns, css: "grid-template-columns" },
  { path: (s) => s.layout?.gridTemplateRows, css: "grid-template-rows" },
  { path: (s) => s.layout?.overflow, css: "overflow" },
  { path: (s) => s.layout?.flexShrink, css: "flex-shrink" },
  { path: (s) => s.layout?.flexGrow, css: "flex-grow" },
  { path: (s) => s.layout?.pointerEvents, css: "pointer-events" },
  { path: (s) => s.box?.width, css: "width" },
  { path: (s) => s.box?.height, css: "height" },
  { path: (s) => s.box?.minWidth, css: "min-width" },
  { path: (s) => s.box?.minHeight, css: "min-height" },
  { path: (s) => s.box?.maxWidth, css: "max-width" },
  { path: (s) => s.box?.maxHeight, css: "max-height" },
  { path: (s) => s.box?.objectFit, css: "object-fit" },
  { path: (s) => s.box?.objectPosition, css: "object-position" },
  { path: (s) => s.box?.margin, css: "margin" },
  { path: (s) => s.box?.marginTop, css: "margin-top" },
  { path: (s) => s.box?.marginRight, css: "margin-right" },
  { path: (s) => s.box?.marginBottom, css: "margin-bottom" },
  { path: (s) => s.box?.marginLeft, css: "margin-left" },
  { path: (s) => s.box?.padding, css: "padding" },
  { path: (s) => s.box?.paddingTop, css: "padding-top" },
  { path: (s) => s.box?.paddingRight, css: "padding-right" },
  { path: (s) => s.box?.paddingBottom, css: "padding-bottom" },
  { path: (s) => s.box?.paddingLeft, css: "padding-left" },
  { path: (s) => s.typography?.fontFamily, css: "font-family" },
  { path: (s) => s.typography?.fontSize, css: "font-size" },
  { path: (s) => s.typography?.fontWeight, css: "font-weight" },
  { path: (s) => s.typography?.fontStyle, css: "font-style" },
  { path: (s) => s.typography?.lineHeight, css: "line-height" },
  { path: (s) => s.typography?.letterSpacing, css: "letter-spacing" },
  { path: (s) => s.typography?.textAlign, css: "text-align" },
  { path: (s) => s.typography?.textDecoration, css: "text-decoration" },
  { path: (s) => s.typography?.textTransform, css: "text-transform" },
  { path: (s) => s.typography?.whiteSpace, css: "white-space" },
  { path: (s) => s.typography?.color, css: "color" },
  { path: (s) => s.background?.color, css: "background-color" },
  { path: (s) => s.background?.image, css: "background-image" },
  { path: (s) => s.background?.size, css: "background-size" },
  { path: (s) => s.background?.position, css: "background-position" },
  { path: (s) => s.background?.repeat, css: "background-repeat" },
  { path: (s) => s.border?.width, css: "border-width" },
  { path: (s) => s.border?.style, css: "border-style" },
  { path: (s) => s.border?.color, css: "border-color" },
  { path: (s) => s.border?.radius, css: "border-radius" },
  { path: (s) => s.border?.topLeftRadius, css: "border-top-left-radius" },
  { path: (s) => s.border?.topRightRadius, css: "border-top-right-radius" },
  { path: (s) => s.border?.bottomRightRadius, css: "border-bottom-right-radius" },
  { path: (s) => s.border?.bottomLeftRadius, css: "border-bottom-left-radius" },
  { path: (s) => s.position?.position, css: "position" },
  { path: (s) => s.position?.top, css: "top" },
  { path: (s) => s.position?.right, css: "right" },
  { path: (s) => s.position?.bottom, css: "bottom" },
  { path: (s) => s.position?.left, css: "left" },
  { path: (s) => s.position?.zIndex, css: "z-index" },
  { path: (s) => s.effects?.opacity, css: "opacity" },
  { path: (s) => s.effects?.boxShadow, css: "box-shadow" },
  { path: (s) => s.effects?.transform, css: "transform" },
  { path: (s) => s.effects?.filter, css: "filter" },
  { path: (s) => s.effects?.backdropFilter, css: "backdrop-filter" },
  { path: (s) => s.effects?.isolation, css: "isolation" },
  { path: (s) => s.effects?.animation, css: "animation" },
];

/**
 * Tailwind-aligned mobile-first media queries for IR responsive keys.
 * IR `responsive.sm` means `sm:` (min-width 640px), not a max-width mobile band.
 */
const MEDIA_MIN: Record<string, string> = {
  sm: "(min-width: 640px)",
  md: "(min-width: 768px)",
  lg: "(min-width: 1024px)",
  xl: "(min-width: 1280px)",
  "2xl": "(min-width: 1536px)",
};

function declarationsFromStyle(style: IrStyle | undefined): string[] {
  if (!style) return [];
  const decls: string[] = [];
  for (const entry of STYLE_PROP_MAP) {
    const value = entry.path(style);
    if (value == null || value === "") continue;
    // Normalize underscore-spaced arbitrary grid templates stored from Tailwind.
    let cssValue = value;
    if (
      entry.css === "grid-template-columns" ||
      entry.css === "grid-template-rows"
    ) {
      cssValue = value.replace(/_/g, " ");
    }
    decls.push(`${entry.css}:${cssValue}`);
  }
  return decls;
}

function pushStyleBlocks(
  blocks: string[],
  selector: string,
  style: IrStyle | undefined,
): void {
  const base = declarationsFromStyle(style);
  if (base.length > 0) {
    blocks.push(`${selector}{${base.join(";")}}`);
  }

  if (!style?.responsive) return;
  for (const bp of Object.keys(style.responsive).sort()) {
    const media = MEDIA_MIN[bp];
    if (!media) continue;
    const decls = declarationsFromStyle(style.responsive[bp]);
    if (decls.length === 0) continue;
    blocks.push(`@media ${media}{${selector}{${decls.join(";")}}}`);
  }
}

/**
 * Stable scoped class for a node inside a Free HTML fallback widget.
 * Root uses `scopeClass`; descendants use `scopeClass__{hash(id)}`.
 */
export function scopedClassForNode(
  scopeClass: string,
  nodeId: string,
  isRoot: boolean,
): string {
  if (isRoot) return scopeClass;
  return `${scopeClass}__${elementorIdFromIrId(nodeId)}`;
}

/**
 * Build scoped CSS for a single fallback node. Does not dump global stylesheets.
 * Prefer {@link serializeSubtreeScopedCss} so child IrStyle facts are not lost.
 */
export function serializeScopedCss(
  scopeClass: string,
  style: IrStyle | undefined,
): string {
  const blocks: string[] = [];
  pushStyleBlocks(blocks, `.${scopeClass}`, style);
  return blocks.join("");
}

/**
 * Emit scoped CSS for every node in a custom-fallback subtree from resolved IrStyle.
 * Selectors are unique per node under the root scope class — no global leakage.
 */
export function serializeSubtreeScopedCss(
  scopeClass: string,
  root: IrNode,
): string {
  const blocks: string[] = [];

  const walk = (node: IrNode, isRoot: boolean) => {
    const cls = scopedClassForNode(scopeClass, node.id, isRoot);
    pushStyleBlocks(blocks, `.${cls}`, node.style);
    for (const child of node.children) {
      walk(child, false);
    }
  };

  walk(root, true);
  return blocks.join("");
}
