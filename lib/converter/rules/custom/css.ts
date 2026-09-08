import type { IrStyle } from "../../ir/schema";

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
  { path: (s) => s.layout?.overflow, css: "overflow" },
  { path: (s) => s.box?.width, css: "width" },
  { path: (s) => s.box?.height, css: "height" },
  { path: (s) => s.box?.minWidth, css: "min-width" },
  { path: (s) => s.box?.minHeight, css: "min-height" },
  { path: (s) => s.box?.maxWidth, css: "max-width" },
  { path: (s) => s.box?.maxHeight, css: "max-height" },
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
  { path: (s) => s.position?.position, css: "position" },
  { path: (s) => s.position?.top, css: "top" },
  { path: (s) => s.position?.right, css: "right" },
  { path: (s) => s.position?.bottom, css: "bottom" },
  { path: (s) => s.position?.left, css: "left" },
  { path: (s) => s.position?.zIndex, css: "z-index" },
  { path: (s) => s.effects?.opacity, css: "opacity" },
  { path: (s) => s.effects?.boxShadow, css: "box-shadow" },
  { path: (s) => s.effects?.transform, css: "transform" },
];

const MEDIA: Record<string, string> = {
  sm: "(max-width: 767px)",
  md: "(max-width: 1023px)",
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
    decls.push(`${entry.css}:${value}`);
  }
  return decls;
}

/**
 * Build scoped CSS for a single fallback node. Does not dump global stylesheets.
 */
export function serializeScopedCss(
  scopeClass: string,
  style: IrStyle | undefined,
): string {
  const blocks: string[] = [];
  const base = declarationsFromStyle(style);
  if (base.length > 0) {
    blocks.push(`.${scopeClass}{${base.join(";")}}`);
  }

  if (style?.responsive) {
    for (const bp of Object.keys(style.responsive).sort()) {
      const media = MEDIA[bp];
      if (!media) continue;
      const decls = declarationsFromStyle(style.responsive[bp]);
      if (decls.length === 0) continue;
      blocks.push(`@media ${media}{.${scopeClass}{${decls.join(";")}}}`);
    }
  }

  return blocks.join("");
}
