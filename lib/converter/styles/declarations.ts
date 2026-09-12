import type { IrStyle } from "../ir/schema";

type StyleGroup = Exclude<keyof IrStyle, "responsive">;

const PROP_MAP: Record<
  string,
  { group: StyleGroup; key: string } | { special: string }
> = {
  display: { group: "layout", key: "display" },
  "flex-direction": { group: "layout", key: "flexDirection" },
  "flex-wrap": { group: "layout", key: "flexWrap" },
  "justify-content": { group: "layout", key: "justifyContent" },
  "align-items": { group: "layout", key: "alignItems" },
  "align-content": { group: "layout", key: "alignContent" },
  gap: { group: "layout", key: "gap" },
  "row-gap": { group: "layout", key: "rowGap" },
  "column-gap": { group: "layout", key: "columnGap" },
  "grid-template-columns": { group: "layout", key: "gridTemplateColumns" },
  "grid-template-rows": { group: "layout", key: "gridTemplateRows" },
  overflow: { group: "layout", key: "overflow" },

  width: { group: "box", key: "width" },
  height: { group: "box", key: "height" },
  "min-width": { group: "box", key: "minWidth" },
  "min-height": { group: "box", key: "minHeight" },
  "max-width": { group: "box", key: "maxWidth" },
  "max-height": { group: "box", key: "maxHeight" },
  margin: { group: "box", key: "margin" },
  "margin-top": { group: "box", key: "marginTop" },
  "margin-right": { group: "box", key: "marginRight" },
  "margin-bottom": { group: "box", key: "marginBottom" },
  "margin-left": { group: "box", key: "marginLeft" },
  padding: { group: "box", key: "padding" },
  "padding-top": { group: "box", key: "paddingTop" },
  "padding-right": { group: "box", key: "paddingRight" },
  "padding-bottom": { group: "box", key: "paddingBottom" },
  "padding-left": { group: "box", key: "paddingLeft" },

  "font-family": { group: "typography", key: "fontFamily" },
  "font-size": { group: "typography", key: "fontSize" },
  "font-weight": { group: "typography", key: "fontWeight" },
  "font-style": { group: "typography", key: "fontStyle" },
  "line-height": { group: "typography", key: "lineHeight" },
  "letter-spacing": { group: "typography", key: "letterSpacing" },
  "text-align": { group: "typography", key: "textAlign" },
  "text-decoration": { group: "typography", key: "textDecoration" },
  "text-transform": { group: "typography", key: "textTransform" },
  color: { group: "typography", key: "color" },

  "background-color": { group: "background", key: "color" },
  "background-image": { group: "background", key: "image" },
  "background-size": { group: "background", key: "size" },
  "background-position": { group: "background", key: "position" },
  "background-repeat": { group: "background", key: "repeat" },
  background: { special: "background-shorthand" },

  "border-width": { group: "border", key: "width" },
  "border-style": { group: "border", key: "style" },
  "border-color": { group: "border", key: "color" },
  "border-radius": { group: "border", key: "radius" },
  "border-top-left-radius": { group: "border", key: "topLeftRadius" },
  "border-top-right-radius": { group: "border", key: "topRightRadius" },
  "border-bottom-right-radius": { group: "border", key: "bottomRightRadius" },
  "border-bottom-left-radius": { group: "border", key: "bottomLeftRadius" },
  border: { special: "border-shorthand" },

  position: { group: "position", key: "position" },
  top: { group: "position", key: "top" },
  right: { group: "position", key: "right" },
  bottom: { group: "position", key: "bottom" },
  left: { group: "position", key: "left" },
  "z-index": { group: "position", key: "zIndex" },

  opacity: { group: "effects", key: "opacity" },
  "box-shadow": { group: "effects", key: "boxShadow" },
  transform: { group: "effects", key: "transform" },
  transition: { special: "transition" },
  animation: { special: "animation" },
};

export type DeclarationApplyResult = {
  style: IrStyle;
  unresolved: string[];
};

function setGroup(
  style: IrStyle,
  group: StyleGroup,
  key: string,
  value: string,
): void {
  const bucket = (style[group] ?? {}) as Record<string, string>;
  bucket[key] = value;
  style[group] = bucket as never;
}

/**
 * Map a flat CSS declaration list into IrStyle groups.
 * Unknown properties are listed in `unresolved` (no guessing).
 */
export function declarationsToIrStyle(
  declarations: Record<string, string>,
): DeclarationApplyResult {
  const style: IrStyle = {};
  const unresolved: string[] = [];

  for (const [prop, rawValue] of Object.entries(declarations)) {
    const value = rawValue.trim();
    if (!value) continue;
    const mapping = PROP_MAP[prop];
    if (!mapping) {
      unresolved.push(prop);
      continue;
    }
    if ("special" in mapping) {
      if (mapping.special === "background-shorthand") {
        if (
          /^(#|rgb|hsl|oklch\(|var\(|transparent$|[a-z]+$)/i.test(value) &&
          !value.includes("url(") &&
          !/gradient\(/i.test(value)
        ) {
          setGroup(style, "background", "color", value);
        } else {
          unresolved.push(prop);
        }
        continue;
      }
      if (mapping.special === "border-shorthand") {
        const parts = value.split(/\s+/);
        if (parts.length >= 1) setGroup(style, "border", "width", parts[0]!);
        if (parts.length >= 2) setGroup(style, "border", "style", parts[1]!);
        if (parts.length >= 3) {
          setGroup(style, "border", "color", parts.slice(2).join(" "));
        }
        continue;
      }
      if (mapping.special === "transition") {
        style.effects = { ...style.effects, hasTransition: true };
        continue;
      }
      if (mapping.special === "animation") {
        style.effects = { ...style.effects, hasAnimation: true };
        continue;
      }
    } else {
      setGroup(style, mapping.group, mapping.key, value);
    }
  }

  return { style, unresolved };
}

/** Deep-merge IrStyle objects. Later arguments win on conflicting keys. */
export function mergeIrStyles(...styles: Array<IrStyle | undefined>): IrStyle {
  const out: IrStyle = {};
  for (const style of styles) {
    if (!style) continue;
    for (const group of [
      "box",
      "layout",
      "typography",
      "background",
      "border",
      "position",
      "effects",
    ] as const) {
      if (style[group]) {
        out[group] = { ...(out[group] ?? {}), ...style[group] } as never;
      }
    }
    if (style.responsive) {
      out.responsive = out.responsive ?? {};
      for (const [bp, partial] of Object.entries(style.responsive)) {
        out.responsive[bp] = mergeIrStyles(out.responsive[bp], partial);
      }
    }
  }
  return out;
}
