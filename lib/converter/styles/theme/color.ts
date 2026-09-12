/**
 * Static CSS color normalization for theme tokens and resolved declarations.
 * Does not invent values for calc()/color-mix()/gradients.
 */

import { oklchToCssColor } from "./oklch";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_RE =
  /^rgba?\(\s*[\d.%]+\s*[,/\s][\d.%\s,/.%]+\)$/i;
const HSL_RE =
  /^hsla?\(\s*[-.\d]+\s*[,/\s][-.\d%\s,/.%]+\)$/i;
const NAMED = new Set([
  "transparent",
  "currentcolor",
  "inherit",
  "white",
  "black",
]);

/**
 * When the value is a statically known color, return a Free-friendly form
 * (hex / rgba / named). Otherwise return null (caller keeps original or skips).
 */
export function canonicalizeCssColor(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (NAMED.has(trimmed.toLowerCase())) return trimmed.toLowerCase();
  if (HEX_RE.test(trimmed)) return trimmed.toLowerCase();
  if (RGB_RE.test(trimmed) || HSL_RE.test(trimmed)) return trimmed;

  if (/^oklch\(/i.test(trimmed)) {
    return oklchToCssColor(trimmed);
  }

  return null;
}

/** Apply a 0–1 alpha onto a canonical color. Returns null if unsupported. */
export function applyCssColorAlpha(
  color: string,
  alpha: number,
): string | null {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) return null;
  const a = Math.round(alpha * 1000) / 1000;
  const trimmed = color.trim();

  if (trimmed.toLowerCase() === "transparent") {
    return `rgba(0, 0, 0, 0)`;
  }

  const hex = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1]!;
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = Number.parseInt(h.slice(0, 2), 16);
    const g = Number.parseInt(h.slice(2, 4), 16);
    const b = Number.parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  const rgba = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (rgba) {
    return `rgba(${rgba[1]}, ${rgba[2]}, ${rgba[3]}, ${a})`;
  }

  const modern = trimmed.match(
    /^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.%]+)?\s*\)$/i,
  );
  if (modern) {
    return `rgba(${modern[1]}, ${modern[2]}, ${modern[3]}, ${a})`;
  }

  return null;
}

/** First font family name from a CSS font-family list. */
export function primaryFontFamily(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const quoted =
    trimmed.match(/^"([^"]+)"/) ?? trimmed.match(/^'([^']+)'/);
  if (quoted) return quoted[1]!;
  const first = trimmed.split(",")[0]?.trim();
  if (!first || first.startsWith("var(")) return null;
  return first.replace(/^["']|["']$/g, "") || null;
}
