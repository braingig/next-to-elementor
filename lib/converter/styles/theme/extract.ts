/**
 * Extract static theme color/font tokens from CSS custom properties
 * (`:root` + Tailwind v4 `@theme`). Values are resolved via var() only —
 * nothing is invented.
 */

import { resolveCssVars } from "../css/parse";
import {
  applyCssColorAlpha,
  canonicalizeCssColor,
  primaryFontFamily,
} from "./color";

export type ThemeTokens = {
  /** Tailwind-like color token → Free-friendly CSS color (hex/rgba/named). */
  colors: Record<string, string>;
  /** Tailwind-like font token (sans, display, …) → primary family name. */
  fonts: Record<string, string>;
};

function resolveProp(
  name: string,
  customProperties: Record<string, string>,
): string | null {
  const raw = customProperties[name];
  if (raw == null) return null;
  const resolved = resolveCssVars(raw, customProperties);
  if (resolved.unresolved) return null;
  return resolved.value.trim();
}

/**
 * Build theme token maps from parsed custom properties.
 * Prefers `--color-*` / `--font-*` (Tailwind v4 `@theme`) when present.
 */
export function extractThemeTokens(
  customProperties: Record<string, string>,
): ThemeTokens {
  const colors: Record<string, string> = {};
  const fonts: Record<string, string> = {};

  const colorKeys = Object.keys(customProperties)
    .filter((k) => k.startsWith("--color-"))
    .sort((a, b) => a.localeCompare(b));

  for (const key of colorKeys) {
    const token = key.slice("--color-".length);
    if (!token) continue;
    const resolved = resolveProp(key, customProperties);
    if (!resolved) continue;
    // Gradients / images are not solid color utilities.
    if (/gradient\(|url\(/i.test(resolved)) continue;
    const canonical = canonicalizeCssColor(resolved);
    if (canonical) {
      colors[token] = canonical;
    }
  }

  const fontKeys = Object.keys(customProperties)
    .filter((k) => k.startsWith("--font-"))
    .sort((a, b) => a.localeCompare(b));

  for (const key of fontKeys) {
    const token = key.slice("--font-".length);
    if (!token) continue;
    const resolved = resolveProp(key, customProperties);
    if (!resolved) continue;
    const family = primaryFontFamily(resolved);
    if (family) {
      fonts[token] = family;
    }
  }

  return { colors, fonts };
}

/**
 * Resolve a theme/curated color token, optionally with Tailwind opacity
 * modifier (`primary/90`).
 */
export function resolveThemeColorToken(
  token: string,
  colors: Record<string, string>,
): string | undefined {
  let base = token;
  let alpha: number | undefined;
  const slash = token.match(/^(.+)\/(\d{1,3})$/);
  if (slash) {
    base = slash[1]!;
    const pct = Number(slash[2]);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) return undefined;
    alpha = pct / 100;
  }

  const color = colors[base];
  if (!color) return undefined;
  if (alpha == null) return color;
  return applyCssColorAlpha(color, alpha) ?? undefined;
}
