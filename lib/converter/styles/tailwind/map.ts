import type { IrStyle } from "../../ir/schema";
import { mergeIrStyles } from "../declarations";
import type { ThemeTokens } from "../theme/extract";
import { resolveThemeColorToken } from "../theme/extract";

const SPACING: Record<string, string> = {
  "0": "0px",
  px: "1px",
  "0.5": "0.125rem",
  "1": "0.25rem",
  "1.5": "0.375rem",
  "2": "0.5rem",
  "2.5": "0.625rem",
  "3": "0.75rem",
  "3.5": "0.875rem",
  "4": "1rem",
  "5": "1.25rem",
  "6": "1.5rem",
  "7": "1.75rem",
  "8": "2rem",
  "9": "2.25rem",
  "10": "2.5rem",
  "11": "2.75rem",
  "12": "3rem",
  "14": "3.5rem",
  "16": "4rem",
  "20": "5rem",
  "24": "6rem",
  auto: "auto",
  full: "100%",
  "1/2": "50%",
  "1/3": "33.333333%",
  "2/3": "66.666667%",
  "1/4": "25%",
  "3/4": "75%",
  "1/5": "20%",
  "2/5": "40%",
  "3/5": "60%",
  "4/5": "80%",
};

const COLORS: Record<string, string> = {
  white: "#ffffff",
  black: "#000000",
  transparent: "transparent",
  "slate-50": "#f8fafc",
  "slate-100": "#f1f5f9",
  "slate-200": "#e2e8f0",
  "slate-300": "#cbd5e1",
  "slate-400": "#94a3b8",
  "slate-500": "#64748b",
  "slate-600": "#475569",
  "slate-700": "#334155",
  "slate-800": "#1e293b",
  "slate-900": "#0f172a",
  "gray-100": "#f3f4f6",
  "gray-500": "#6b7280",
  "gray-900": "#111827",
  "red-500": "#ef4444",
  "red-600": "#dc2626",
  "orange-500": "#f97316",
  "amber-500": "#f59e0b",
  "yellow-500": "#eab308",
  "green-500": "#22c55e",
  "green-600": "#16a34a",
  "teal-50": "#f0fdfa",
  "teal-100": "#ccfbf1",
  "teal-500": "#14b8a6",
  "teal-600": "#0d9488",
  "teal-700": "#0f766e",
  "blue-50": "#eff6ff",
  "blue-500": "#3b82f6",
  "blue-600": "#2563eb",
  "indigo-500": "#6366f1",
  "purple-50": "#faf5ff",
  "purple-500": "#a855f7",
  "purple-600": "#9333ea",
  "pink-500": "#ec4899",
};

const FONT_SIZE: Record<string, string> = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.25rem",
  "2xl": "1.5rem",
  "3xl": "1.875rem",
  "4xl": "2.25rem",
  "5xl": "3rem",
  "6xl": "3.75rem",
  "7xl": "4.5rem",
};

const LINE_HEIGHT: Record<string, string> = {
  none: "1",
  tight: "1.25",
  snug: "1.375",
  normal: "1.5",
  relaxed: "1.625",
  loose: "2",
  "3": "0.75rem",
  "4": "1rem",
  "5": "1.25rem",
  "6": "1.5rem",
  "7": "1.75rem",
  "8": "2rem",
  "9": "2.25rem",
  "10": "2.5rem",
};

const LETTER_SPACING: Record<string, string> = {
  tighter: "-0.05em",
  tight: "-0.025em",
  normal: "0em",
  wide: "0.025em",
  wider: "0.05em",
  widest: "0.1em",
};

const FONT_WEIGHT: Record<string, string> = {
  thin: "100",
  light: "300",
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
  extrabold: "800",
  black: "900",
};

const ROUNDED: Record<string, string> = {
  none: "0px",
  sm: "0.125rem",
  DEFAULT: "0.25rem",
  md: "0.375rem",
  lg: "0.5rem",
  xl: "0.75rem",
  "2xl": "1rem",
  "3xl": "1.5rem",
  full: "9999px",
};

const BREAKPOINTS = new Set(["sm", "md", "lg", "xl", "2xl"]);

function spacing(token: string): string | undefined {
  if (SPACING[token] != null) return SPACING[token];
  // Arbitrary value support for a defined subset: w-[12px]
  const arb = token.match(/^\[(.+)\]$/);
  if (arb) return arb[1];
  return undefined;
}

function color(
  token: string,
  theme?: ThemeTokens,
): string | undefined {
  const fromTheme = theme
    ? resolveThemeColorToken(token, theme.colors)
    : undefined;
  if (fromTheme) return fromTheme;

  // Curated map may also use opacity modifiers (e.g. slate-900/80).
  const slash = token.match(/^(.+)\/(\d{1,3})$/);
  if (slash && COLORS[slash[1]!] != null) {
    return resolveThemeColorToken(token, COLORS);
  }

  if (COLORS[token] != null) return COLORS[token];
  const arb = token.match(/^\[(.+)\]$/);
  if (arb) return arb[1];
  return undefined;
}

/**
 * Resolve a single Tailwind utility (without variant prefix) into IrStyle.
 * Returns null if unknown.
 */
export function resolveTailwindUtility(
  utility: string,
  theme?: ThemeTokens,
): IrStyle | null {
  // Layout / display
  if (utility === "flex") return { layout: { display: "flex" } };
  if (utility === "inline-flex") return { layout: { display: "inline-flex" } };
  if (utility === "block") return { layout: { display: "block" } };
  if (utility === "inline-block") return { layout: { display: "inline-block" } };
  if (utility === "grid") return { layout: { display: "grid" } };
  if (utility === "hidden") return { layout: { display: "none" } };
  // Visually hidden but kept for a11y in source — Elementor has no sr-only;
  // map to display:none so the text does not leak into the visual layout.
  if (utility === "sr-only") return { layout: { display: "none" } };
  if (utility === "flex-row") return { layout: { flexDirection: "row" } };
  if (utility === "flex-col") return { layout: { flexDirection: "column" } };
  if (utility === "flex-wrap") return { layout: { flexWrap: "wrap" } };
  if (utility === "flex-nowrap") return { layout: { flexWrap: "nowrap" } };
  // Free Container overflow control: "" | "hidden" | "auto"
  if (utility === "overflow-hidden") {
    return { layout: { overflow: "hidden" } };
  }
  if (utility === "overflow-auto") {
    return { layout: { overflow: "auto" } };
  }

  // Free Container grid_columns_grid supports 1–12 fr tracks only.
  const gridCols = utility.match(/^grid-cols-([1-9]|1[0-2])$/);
  if (gridCols) {
    return { layout: { gridTemplateColumns: gridCols[1]! } };
  }
  // Preserve arbitrary track templates in IR so chrome heuristics can detect
  // unsupported `1fr + auto` patterns (Free cannot emit unequal fr tracks).
  const arbGridCols = utility.match(/^grid-cols-\[(.+)\]$/);
  if (arbGridCols) {
    return { layout: { gridTemplateColumns: arbGridCols[1]! } };
  }

  // Replaced-element fit (logos / hero media)
  if (utility === "object-contain") {
    return { box: { objectFit: "contain" } };
  }
  if (utility === "object-cover") {
    return { box: { objectFit: "cover" } };
  }
  if (utility === "object-fill") {
    return { box: { objectFit: "fill" } };
  }
  if (utility === "object-none") {
    return { box: { objectFit: "none" } };
  }
  if (utility === "object-scale-down") {
    return { box: { objectFit: "scale-down" } };
  }
  const objectPos = utility.match(
    /^object-(center|top|bottom|left|right|left-top|left-bottom|right-top|right-bottom)$/,
  );
  if (objectPos) {
    const map: Record<string, string> = {
      center: "center center",
      top: "center top",
      bottom: "center bottom",
      left: "left center",
      right: "right center",
      "left-top": "left top",
      "left-bottom": "left bottom",
      "right-top": "right top",
      "right-bottom": "right bottom",
    };
    return { box: { objectPosition: map[objectPos[1]!] } };
  }

  const justify = utility.match(/^justify-(start|end|center|between|around|evenly)$/);
  if (justify) {
    const map: Record<string, string> = {
      start: "flex-start",
      end: "flex-end",
      center: "center",
      between: "space-between",
      around: "space-around",
      evenly: "space-evenly",
    };
    return { layout: { justifyContent: map[justify[1]!] } };
  }

  const items = utility.match(/^items-(start|end|center|baseline|stretch)$/);
  if (items) {
    const map: Record<string, string> = {
      start: "flex-start",
      end: "flex-end",
      center: "center",
      baseline: "baseline",
      stretch: "stretch",
    };
    return { layout: { alignItems: map[items[1]!] } };
  }

  // Axis gaps / space-between children before generic `gap-*`
  // (otherwise `gap-x-4` is consumed as an unknown gap token).
  const gapX = utility.match(/^gap-x-(\S+)$/);
  if (gapX) {
    const v = spacing(gapX[1]!);
    return v ? { layout: { columnGap: v } } : null;
  }
  const gapY = utility.match(/^gap-y-(\S+)$/);
  if (gapY) {
    const v = spacing(gapY[1]!);
    return v ? { layout: { rowGap: v } } : null;
  }
  const spaceX = utility.match(/^space-x-(\S+)$/);
  if (spaceX) {
    const v = spacing(spaceX[1]!);
    return v ? { layout: { columnGap: v } } : null;
  }
  const spaceY = utility.match(/^space-y-(\S+)$/);
  if (spaceY) {
    const v = spacing(spaceY[1]!);
    return v ? { layout: { rowGap: v } } : null;
  }

  const gap = utility.match(/^gap-(\S+)$/);
  if (gap) {
    const v = spacing(gap[1]!);
    return v ? { layout: { gap: v } } : null;
  }

  if (utility === "whitespace-nowrap") {
    return { typography: { whiteSpace: "nowrap" } };
  }
  if (utility === "whitespace-normal") {
    return { typography: { whiteSpace: "normal" } };
  }

  if (utility === "shrink-0" || utility === "flex-shrink-0") {
    return { layout: { flexShrink: "0" } };
  }
  if (utility === "shrink" || utility === "flex-shrink") {
    return { layout: { flexShrink: "1" } };
  }
  if (utility === "grow-0" || utility === "flex-grow-0") {
    return { layout: { flexGrow: "0" } };
  }
  if (utility === "grow" || utility === "flex-grow") {
    return { layout: { flexGrow: "1" } };
  }

  const minW = utility.match(/^min-w-(\S+)$/);
  if (minW) {
    const named: Record<string, string> = {
      full: "100%",
      min: "min-content",
      max: "max-content",
      fit: "fit-content",
    };
    const v = named[minW[1]!] ?? spacing(minW[1]!);
    return v ? { box: { minWidth: v } } : null;
  }

  // Spacing
  const p = utility.match(/^p-(\S+)$/);
  if (p) {
    const v = spacing(p[1]!);
    return v ? { box: { padding: v } } : null;
  }
  const px = utility.match(/^px-(\S+)$/);
  if (px) {
    const v = spacing(px[1]!);
    return v ? { box: { paddingLeft: v, paddingRight: v } } : null;
  }
  const py = utility.match(/^py-(\S+)$/);
  if (py) {
    const v = spacing(py[1]!);
    return v ? { box: { paddingTop: v, paddingBottom: v } } : null;
  }
  for (const [prefix, key] of [
    ["pt", "paddingTop"],
    ["pr", "paddingRight"],
    ["pb", "paddingBottom"],
    ["pl", "paddingLeft"],
    ["mt", "marginTop"],
    ["mr", "marginRight"],
    ["mb", "marginBottom"],
    ["ml", "marginLeft"],
  ] as const) {
    const m = utility.match(new RegExp(`^${prefix}-(\\S+)$`));
    if (m) {
      const v = spacing(m[1]!);
      return v ? { box: { [key]: v } } : null;
    }
  }
  const mAll = utility.match(/^m-(\S+)$/);
  if (mAll) {
    const v = spacing(mAll[1]!);
    return v ? { box: { margin: v } } : null;
  }
  const mx = utility.match(/^mx-(\S+)$/);
  if (mx) {
    const v = spacing(mx[1]!);
    return v ? { box: { marginLeft: v, marginRight: v } } : null;
  }
  const my = utility.match(/^my-(\S+)$/);
  if (my) {
    const v = spacing(my[1]!);
    return v ? { box: { marginTop: v, marginBottom: v } } : null;
  }

  const w = utility.match(/^w-(\S+)$/);
  if (w) {
    const v = spacing(w[1]!);
    return v ? { box: { width: v } } : null;
  }
  const h = utility.match(/^h-(\S+)$/);
  if (h) {
    const v = spacing(h[1]!);
    return v ? { box: { height: v } } : null;
  }
  const maxW = utility.match(/^max-w-(\S+)$/);
  if (maxW) {
    const named: Record<string, string> = {
      sm: "24rem",
      md: "28rem",
      lg: "32rem",
      xl: "36rem",
      "2xl": "42rem",
      "3xl": "48rem",
      "4xl": "56rem",
      "5xl": "64rem",
      "6xl": "72rem",
      "7xl": "80rem",
      full: "100%",
      prose: "65ch",
      screen: "100vw",
    };
    const v = named[maxW[1]!] ?? spacing(maxW[1]!);
    return v ? { box: { maxWidth: v } } : null;
  }
  const minH = utility.match(/^min-h-(\S+)$/);
  if (minH) {
    const named: Record<string, string> = {
      screen: "100vh",
      full: "100%",
    };
    const v = named[minH[1]!] ?? spacing(minH[1]!);
    return v ? { box: { minHeight: v } } : null;
  }
  const maxH = utility.match(/^max-h-(\S+)$/);
  if (maxH) {
    const named: Record<string, string> = {
      screen: "100vh",
      full: "100%",
      none: "none",
    };
    const v = named[maxH[1]!] ?? spacing(maxH[1]!);
    return v ? { box: { maxHeight: v } } : null;
  }

  // Typography
  const textSize = utility.match(
    /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)$/,
  );
  if (textSize) {
    return { typography: { fontSize: FONT_SIZE[textSize[1]!] } };
  }
  const textAlign = utility.match(/^text-(left|center|right|justify)$/);
  if (textAlign) {
    return { typography: { textAlign: textAlign[1]! } };
  }
  const textColor = utility.match(/^text-(.+)$/);
  if (textColor && !FONT_SIZE[textColor[1]!]) {
    const c = color(textColor[1]!, theme);
    if (c) return { typography: { color: c } };
  }
  const fw = utility.match(/^font-(.+)$/);
  if (fw) {
    if (FONT_WEIGHT[fw[1]!]) {
      return { typography: { fontWeight: FONT_WEIGHT[fw[1]!] } };
    }
    const family = theme?.fonts[fw[1]!];
    if (family) {
      return { typography: { fontFamily: family } };
    }
  }
  const leading = utility.match(/^leading-(.+)$/);
  if (leading) {
    if (LINE_HEIGHT[leading[1]!]) {
      return { typography: { lineHeight: LINE_HEIGHT[leading[1]!] } };
    }
    const arb = leading[1]!.match(/^\[(.+)\]$/);
    if (arb) return { typography: { lineHeight: arb[1]!.replace(/_/g, " ") } };
  }
  const tracking = utility.match(/^tracking-(.+)$/);
  if (tracking) {
    if (LETTER_SPACING[tracking[1]!]) {
      return { typography: { letterSpacing: LETTER_SPACING[tracking[1]!] } };
    }
    const arb = tracking[1]!.match(/^\[(.+)\]$/);
    if (arb) return { typography: { letterSpacing: arb[1]!.replace(/_/g, " ") } };
  }
  if (utility === "italic") return { typography: { fontStyle: "italic" } };
  if (utility === "uppercase") return { typography: { textTransform: "uppercase" } };
  if (utility === "lowercase") return { typography: { textTransform: "lowercase" } };
  if (utility === "capitalize") return { typography: { textTransform: "capitalize" } };
  if (utility === "underline") return { typography: { textDecoration: "underline" } };
  if (utility === "line-through") return { typography: { textDecoration: "line-through" } };

  // Background
  const bg = utility.match(/^bg-(.+)$/);
  if (bg) {
    const token = bg[1]!;
    const arb = token.match(/^\[(.+)\]$/);
    if (arb) {
      // Tailwind arbitrary values use `_` for spaces.
      const inner = arb[1]!.replace(/_/g, " ");
      if (/gradient\(/i.test(inner) || /^url\(/i.test(inner)) {
        return { background: { image: inner } };
      }
      return { background: { color: inner } };
    }
    const c = color(token, theme);
    if (c) {
      if (/gradient\(/i.test(c) || /^url\(/i.test(c)) {
        return { background: { image: c } };
      }
      return { background: { color: c } };
    }
  }

  // Border / radius
  if (utility === "border") {
    return { border: { width: "1px", style: "solid" } };
  }
  if (utility === "border-t") {
    return { border: { width: "1px 0 0 0", style: "solid" } };
  }
  if (utility === "border-r") {
    return { border: { width: "0 1px 0 0", style: "solid" } };
  }
  if (utility === "border-b") {
    return { border: { width: "0 0 1px 0", style: "solid" } };
  }
  if (utility === "border-l") {
    return { border: { width: "0 0 0 1px", style: "solid" } };
  }
  const borderSideW = utility.match(/^border-([trbl])-(\d+)$/);
  if (borderSideW) {
    const side = borderSideW[1]!;
    const px = `${borderSideW[2]}px`;
    const width =
      side === "t"
        ? `${px} 0 0 0`
        : side === "r"
          ? `0 ${px} 0 0`
          : side === "b"
            ? `0 0 ${px} 0`
            : `0 0 0 ${px}`;
    return { border: { width, style: "solid" } };
  }
  const borderW = utility.match(/^border-(\d+)$/);
  if (borderW) {
    return { border: { width: `${borderW[1]}px`, style: "solid" } };
  }
  const borderC = utility.match(/^border-(.+)$/);
  if (borderC) {
    const c = color(borderC[1]!, theme);
    if (c) return { border: { color: c } };
  }
  if (utility === "rounded") {
    return { border: { radius: ROUNDED.DEFAULT } };
  }
  const rounded = utility.match(/^rounded-(.+)$/);
  if (rounded && ROUNDED[rounded[1]!]) {
    return { border: { radius: ROUNDED[rounded[1]!] } };
  }

  // Position
  if (utility === "relative") return { position: { position: "relative" } };
  if (utility === "absolute") return { position: { position: "absolute" } };
  if (utility === "fixed") return { position: { position: "fixed" } };
  if (utility === "sticky") return { position: { position: "sticky" } };
  if (utility === "static") return { position: { position: "static" } };
  if (utility === "inset-0") {
    return {
      position: { top: "0px", right: "0px", bottom: "0px", left: "0px" },
    };
  }
  if (utility === "inset-x-0") {
    return { position: { left: "0px", right: "0px" } };
  }
  if (utility === "inset-y-0") {
    return { position: { top: "0px", bottom: "0px" } };
  }
  for (const side of ["top", "right", "bottom", "left"] as const) {
    const m = utility.match(new RegExp(`^${side}-(\\S+)$`));
    if (m) {
      const v = spacing(m[1]!);
      return v ? { position: { [side]: v } } : null;
    }
  }
  const z = utility.match(/^z-(\d+|auto)$/);
  if (z) {
    return { position: { zIndex: z[1]! } };
  }

  // Effects
  const opacity = utility.match(/^opacity-(\d+)$/);
  if (opacity) {
    return { effects: { opacity: String(Number(opacity[1]) / 100) } };
  }
  if (utility === "shadow" || utility === "shadow-md") {
    return {
      effects: {
        boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      },
    };
  }
  if (utility === "shadow-sm") {
    return { effects: { boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)" } };
  }
  if (utility === "shadow-lg") {
    return {
      effects: {
        boxShadow:
          "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      },
    };
  }
  if (utility === "shadow-xl") {
    return {
      effects: {
        boxShadow:
          "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      },
    };
  }
  if (utility === "shadow-none") {
    return { effects: { boxShadow: "none" } };
  }
  const arbShadow = utility.match(/^shadow-\[(.+)\]$/);
  if (arbShadow) {
    return {
      effects: { boxShadow: arbShadow[1]!.replace(/_/g, " ") },
    };
  }

  // Backdrop / isolation / pointer-events — Free native lacks these; IR → custom CSS.
  if (utility === "isolate") {
    return { effects: { isolation: "isolate" } };
  }
  if (utility === "pointer-events-none") {
    return { layout: { pointerEvents: "none" } };
  }
  if (utility === "pointer-events-auto") {
    return { layout: { pointerEvents: "auto" } };
  }
  if (utility === "backdrop-blur" || utility === "backdrop-blur-md") {
    return { effects: { backdropFilter: "blur(12px)" } };
  }
  if (utility === "backdrop-blur-sm") {
    return { effects: { backdropFilter: "blur(4px)" } };
  }
  if (utility === "backdrop-blur-lg") {
    return { effects: { backdropFilter: "blur(16px)" } };
  }
  const arbBackdrop = utility.match(/^backdrop-blur-\[(.+)\]$/);
  if (arbBackdrop) {
    return {
      effects: {
        backdropFilter: `blur(${arbBackdrop[1]!.replace(/_/g, " ")})`,
      },
    };
  }

  // Transforms — Free native cannot map these; IR facts enable custom HTML CSS.
  const translate = utility.match(/^-?translate-([xy])-(.+)$/);
  if (translate) {
    const axis = translate[1]!;
    const neg = utility.startsWith("-");
    const v = spacing(translate[2]!);
    if (v) {
      const val = neg && !v.startsWith("-") ? `-${v}` : v;
      return {
        effects: {
          transform:
            axis === "x" ? `translateX(${val})` : `translateY(${val})`,
        },
      };
    }
  }
  const rotate = utility.match(/^-?rotate-(.+)$/);
  if (rotate) {
    const neg = utility.startsWith("-");
    const token = rotate[1]!;
    const named: Record<string, string> = {
      "0": "0deg",
      "1": "1deg",
      "2": "2deg",
      "3": "3deg",
      "6": "6deg",
      "12": "12deg",
      "45": "45deg",
      "90": "90deg",
      "180": "180deg",
    };
    let angle = named[token];
    if (!angle) {
      const arb = token.match(/^\[(.+)\]$/);
      if (arb) angle = arb[1]!.replace(/_/g, " ");
    }
    if (angle) {
      return {
        effects: {
          transform: `rotate(${neg && !angle.startsWith("-") ? `-${angle}` : angle})`,
        },
      };
    }
  }
  const scale = utility.match(/^scale-(\d+)$/);
  if (scale) {
    return {
      effects: { transform: `scale(${Number(scale[1]) / 100})` },
    };
  }
  const scaleAxis = utility.match(/^scale-([xy])-(\d+)$/);
  if (scaleAxis) {
    const n = Number(scaleAxis[2]) / 100;
    return {
      effects: {
        transform:
          scaleAxis[1] === "x" ? `scaleX(${n})` : `scaleY(${n})`,
      },
    };
  }

  // Arbitrary rounded / sizing already covered via spacing([...])
  const roundedArb = utility.match(/^rounded-\[(.+)\]$/);
  if (roundedArb) {
    return { border: { radius: roundedArb[1]!.replace(/_/g, " ") } };
  }

  // from- / to- gradient stops alone are incomplete without direction — leave unknown
  // unless composed as bg-[linear-gradient(...)] which is handled above.

  return null;
}

export type TailwindResolveResult = {
  style: IrStyle;
  unknown: string[];
};

/**
 * Resolve a list of class tokens. Responsive variants (`md:flex-col`) become
 * `style.responsive.md`. Unknown utilities are listed (no guessing).
 * Optional `theme` supplies project `@theme` / `:root` color and font tokens.
 */
export function resolveTailwindClasses(
  classNames: string[],
  theme?: ThemeTokens,
): TailwindResolveResult {
  let style: IrStyle = {};
  const unknown: string[] = [];

  for (const raw of classNames) {
    const token = raw.trim();
    if (!token) continue;

    // Split variants: md:hover:flex → we only support responsive + bare utility.
    const parts = token.split(":");
    let breakpoint: string | undefined;
    let utility = token;

    if (parts.length === 2 && BREAKPOINTS.has(parts[0]!)) {
      breakpoint = parts[0];
      utility = parts[1]!;
    } else if (parts.length > 1) {
      // hover:, dark:, etc. — not applied in MVP
      unknown.push(token);
      continue;
    }

    const resolved = resolveTailwindUtility(utility, theme);
    if (!resolved) {
      unknown.push(token);
      continue;
    }

    if (breakpoint) {
      style = mergeIrStyles(style, {
        responsive: { [breakpoint]: resolved },
      });
    } else {
      style = mergeIrStyles(style, resolved);
    }
  }

  return { style, unknown };
}
