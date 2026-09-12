/**
 * Static OKLCH → sRGB conversion for theme token fidelity.
 * Only converts parseable oklch()/oklab() literals — no invented values.
 */

export type ParsedOklch = {
  l: number;
  c: number;
  h: number;
  alpha: number;
};

const OKLCH_RE =
  /^oklch\(\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*(?:\/\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?%?))?\s*\)$/i;

function parseChannel(raw: string, asPercentOf = 1): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("%")) {
    const n = Number(trimmed.slice(0, -1));
    if (!Number.isFinite(n)) return null;
    return (n / 100) * asPercentOf;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** Parse a single oklch(...) literal. Returns null when not statically parseable. */
export function parseOklch(value: string): ParsedOklch | null {
  const m = value.trim().match(OKLCH_RE);
  if (!m) return null;
  const l = parseChannel(m[1]!, 1);
  const c = parseChannel(m[2]!);
  const h = parseChannel(m[3]!);
  if (l == null || c == null || h == null) return null;
  let alpha = 1;
  if (m[4] != null) {
    const a = parseChannel(m[4]!, 1);
    if (a == null) return null;
    alpha = a;
  }
  return { l, c, h, alpha };
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function linearToSrgb(c: number): number {
  const abs = Math.abs(c);
  const sign = Math.sign(c);
  const encoded =
    abs > 0.0031308 ? 1.055 * Math.pow(abs, 1 / 2.4) - 0.055 : 12.92 * abs;
  return sign * encoded;
}

/** Convert OKLCH channels to sRGB 0–1 (may be out of gamut before clamp). */
export function oklchToLinearSrgb(l: number, c: number, hDeg: number): {
  r: number;
  g: number;
  b: number;
} {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  return {
    r: 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    g: -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    b: -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  };
}

function toByte(channel: number): number {
  return Math.round(clamp01(linearToSrgb(channel)) * 255);
}

/** Convert parseable oklch(...) to #rrggbb or rgba(...). */
export function oklchToCssColor(value: string): string | null {
  const parsed = parseOklch(value);
  if (!parsed) return null;
  const rgb = oklchToLinearSrgb(parsed.l, parsed.c, parsed.h);
  const r = toByte(rgb.r);
  const g = toByte(rgb.g);
  const b = toByte(rgb.b);
  if (parsed.alpha < 1) {
    const a = Math.round(clamp01(parsed.alpha) * 1000) / 1000;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
