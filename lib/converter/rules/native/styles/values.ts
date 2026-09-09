/**
 * CSS length / Elementor value helpers for native conversion.
 * Only produce catalog-compatible shapes (slider, dimensions, gaps).
 */

export type CssLength = {
  size: number;
  unit: string;
};

const LENGTH_RE = /^(-?\d+(?:\.\d+)?)(px|em|rem|%|vh|vw)?$/i;

export function parseCssLength(value: string | undefined): CssLength | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === "0") return { size: 0, unit: "px" };
  const m = trimmed.match(LENGTH_RE);
  if (!m) return undefined;
  return {
    size: Number(m[1]),
    unit: (m[2] ?? "px").toLowerCase(),
  };
}

/** Elementor SLIDER control value. */
export function toSlider(value: string | undefined): Record<string, unknown> | undefined {
  const parsed = parseCssLength(value);
  if (!parsed) return undefined;
  return { unit: parsed.unit, size: parsed.size };
}

/**
 * Map IR/CSS grid-template-columns facts to Free `grid_columns_grid`
 * (`{ unit: "fr", size: 1..12 }` only — see Group_Control_Grid_Container).
 * Returns undefined for unsupported / ambiguous templates (no invention).
 */
export function toGridColumns(
  value: string | undefined,
): { unit: "fr"; size: number } | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^([1-9]|1[0-2])$/.test(trimmed)) {
    return { unit: "fr", size: Number(trimmed) };
  }
  const repeat = trimmed.match(
    /^repeat\(\s*([1-9]|1[0-2])\s*,\s*(?:minmax\(0,\s*1fr\)|1fr)\s*\)$/i,
  );
  if (repeat) {
    return { unit: "fr", size: Number(repeat[1]) };
  }
  return undefined;
}

/**
 * Elementor DIMENSIONS from a shorthand or equal sides.
 * "20px" → all sides 20; "8px 12px" → top/bottom 8, left/right 12.
 */
export function toDimensions(
  value: string | undefined,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return undefined;

  let top: string | undefined;
  let right: string | undefined;
  let bottom: string | undefined;
  let left: string | undefined;
  let unit = "px";

  if (parts.length === 1) {
    const p = parseCssLength(parts[0]);
    if (!p) return undefined;
    top = right = bottom = left = String(p.size);
    unit = p.unit;
  } else if (parts.length === 2) {
    const v = parseCssLength(parts[0]);
    const h = parseCssLength(parts[1]);
    if (!v || !h) return undefined;
    top = bottom = String(v.size);
    left = right = String(h.size);
    unit = v.unit;
  } else if (parts.length === 3) {
    const t = parseCssLength(parts[0]);
    const h = parseCssLength(parts[1]);
    const b = parseCssLength(parts[2]);
    if (!t || !h || !b) return undefined;
    top = String(t.size);
    left = right = String(h.size);
    bottom = String(b.size);
    unit = t.unit;
  } else {
    const t = parseCssLength(parts[0]);
    const r = parseCssLength(parts[1]);
    const b = parseCssLength(parts[2]);
    const l = parseCssLength(parts[3]);
    if (!t || !r || !b || !l) return undefined;
    top = String(t.size);
    right = String(r.size);
    bottom = String(b.size);
    left = String(l.size);
    unit = t.unit;
  }

  return {
    unit,
    top,
    right,
    bottom,
    left,
    isLinked: top === right && right === bottom && bottom === left,
  };
}

/** Build dimensions from individual side props when present. */
export function toDimensionsFromSides(sides: {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  all?: string;
}): Record<string, unknown> | undefined {
  if (sides.all && !sides.top && !sides.right && !sides.bottom && !sides.left) {
    return toDimensions(sides.all);
  }
  const t = parseCssLength(sides.top);
  const r = parseCssLength(sides.right);
  const b = parseCssLength(sides.bottom);
  const l = parseCssLength(sides.left);
  if (!t && !r && !b && !l) {
    return sides.all ? toDimensions(sides.all) : undefined;
  }
  const unit = t?.unit ?? r?.unit ?? b?.unit ?? l?.unit ?? "px";
  const top = t ? String(t.size) : "0";
  const right = r ? String(r.size) : "0";
  const bottom = b ? String(b.size) : "0";
  const left = l ? String(l.size) : "0";
  return {
    unit,
    top,
    right,
    bottom,
    left,
    isLinked: top === right && right === bottom && bottom === left,
  };
}

/** Elementor flex GAPS control. */
export function toGaps(value: string | undefined): Record<string, unknown> | undefined {
  const parsed = parseCssLength(value);
  if (!parsed) return undefined;
  const size = String(parsed.size);
  return {
    unit: parsed.unit,
    column: size,
    row: size,
    isLinked: true,
  };
}

export function toUrl(
  href: string | undefined,
  opts?: { target?: string; rel?: string },
): Record<string, unknown> | undefined {
  if (!href) return undefined;
  return {
    url: href,
    is_external: opts?.target === "_blank" ? "on" : "",
    nofollow: opts?.rel?.includes("nofollow") ? "on" : "",
    custom_attributes: "",
  };
}

/** Map IR text-align / justify to Elementor choose values. */
export function mapAlign(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const v = value.toLowerCase();
  if (v === "left" || v === "start") return "left";
  if (v === "right" || v === "end") return "right";
  if (v === "center") return "center";
  if (v === "justify") return "justify";
  return undefined;
}

/** Flex justify-content → Elementor flex_justify_content. */
export function mapFlexJustify(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const map: Record<string, string> = {
    "flex-start": "start",
    start: "start",
    "flex-end": "end",
    end: "end",
    center: "center",
    "space-between": "space-between",
    "space-around": "space-around",
    "space-evenly": "space-evenly",
  };
  return map[value] ?? undefined;
}

export function mapFlexAlign(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const map: Record<string, string> = {
    "flex-start": "start",
    start: "start",
    "flex-end": "end",
    end: "end",
    center: "center",
    stretch: "stretch",
    baseline: "baseline",
  };
  return map[value] ?? undefined;
}

/**
 * Parse a CSS box-shadow into Elementor BOX_SHADOW control shape.
 * Uses the first shadow only. Returns null when the value cannot be parsed safely.
 */
export function toBoxShadow(
  value: string | undefined,
): Record<string, unknown> | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "none") {
    return {
      horizontal: 0,
      vertical: 0,
      blur: 0,
      spread: 0,
      color: "transparent",
    };
  }

  // Take first shadow (ignore multi-layer for Free control fidelity)
  const first = trimmed.split(/,(?![^(]*\))/)[0]?.trim();
  if (!first) return null;

  const inset = /\binset\b/i.test(first);
  const withoutInset = first.replace(/\binset\b/gi, "").trim();

  // Color may be rgba()/rgb()/hsl()/#hex or named at start or end
  let color = "rgba(0, 0, 0, 0.1)";
  let rest = withoutInset;
  const colorMatch =
    withoutInset.match(
      /(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})\s*$/,
    ) ??
    withoutInset.match(
      /^(rgba?\([^)]+\)|hsla?\([^)]+\)|#[0-9a-fA-F]{3,8})\s+/,
    );
  if (colorMatch) {
    color = colorMatch[1]!;
    rest = withoutInset.replace(colorMatch[0], "").trim();
  } else {
    const named = withoutInset.match(
      /\b(black|white|transparent|currentColor)\b/i,
    );
    if (named) {
      color = named[1]!.toLowerCase();
      rest = withoutInset.replace(named[0], "").trim();
    }
  }

  const lengths = rest
    .split(/\s+/)
    .map((p) => parseCssLength(p))
    .filter((p): p is CssLength => Boolean(p));

  if (lengths.length < 2) return null;

  const horizontal = lengths[0]!.size;
  const vertical = lengths[1]!.size;
  const blur = lengths[2]?.size ?? 0;
  const spread = lengths[3]?.size ?? 0;

  void inset; // position control is separate; outline/inset handled by caller if needed
  return {
    horizontal,
    vertical,
    blur,
    spread,
    color,
  };
}
