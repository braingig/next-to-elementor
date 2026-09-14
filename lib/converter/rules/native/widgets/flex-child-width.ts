import type { ElementorSettings } from "../types";
import type { NativeElementDraft } from "./leaf";

/**
 * Elementor Free containers with `content_width: "full"` default to
 * `--width: 100%` in frontend CSS. Nested flex-row children therefore
 * each claim the full parent width and wrap/stack — unlike CSS flex items
 * (`width: auto`), which hug content.
 *
 * Additionally, Elementor's flex-direction `row` selector sets
 * `--flex-wrap-mobile: wrap`, and frontend CSS applies
 * `--flex-wrap: var(--flex-wrap-mobile)` below 767px. CSS/Tailwind flex
 * defaults to `nowrap`, so an explicit `flex_wrap` / `flex_wrap_mobile`
 * of `nowrap` is required to keep horizontal bars (navbars) on one line.
 *
 * Row mode also sets `--container-widget-flex-grow: 1` on leaf widgets
 * while `.e-con .elementor-widget { min-width: 0 }` — without
 * `_element_width: "auto"`, HTML links/CTAs grow/shrink and overlap.
 */

const AUTO_WIDTH = { size: "auto", unit: "custom" } as const;
const FULL_WIDTH = { size: 100, unit: "%" } as const;

/** Leaf widgets that should hug content inside flex-row chrome. */
const LEAF_SHRINK_WIDGET_TYPES = new Set([
  "html",
  "button",
  "icon",
  "image",
]);

function isRowDirection(value: unknown): boolean {
  return value === "row" || value === "row-reverse";
}

function isColumnDirection(value: unknown): boolean {
  return value === "column" || value === "column-reverse";
}

function hasExplicitWidth(settings: ElementorSettings): boolean {
  return (
    settings.width != null ||
    settings.width_tablet != null ||
    settings.width_mobile != null
  );
}

function isFullContentWidth(settings: ElementorSettings): boolean {
  return settings.content_width !== "boxed";
}

function hasExplicitWrap(settings: ElementorSettings): boolean {
  return (
    settings.flex_wrap != null ||
    settings.flex_wrap_tablet != null ||
    settings.flex_wrap_mobile != null
  );
}

/**
 * Match CSS flex default (`nowrap`) on Elementor flex-row containers.
 * Without this, Elementor forces mobile wrap and horizontal clusters reflow.
 * When wrap is already `nowrap` from source (e.g. whitespace-nowrap), still
 * emit `flex_wrap_mobile: nowrap` so tablet/mobile do not reintroduce wrap.
 */
export function applyFlexRowNowrapDefault(settings: ElementorSettings): void {
  if (!isRowDirection(settings.flex_direction)) return;
  if (!hasExplicitWrap(settings)) {
    settings.flex_wrap = "nowrap";
    settings.flex_wrap_mobile = "nowrap";
    return;
  }
  if (settings.flex_wrap === "nowrap" && settings.flex_wrap_mobile == null) {
    settings.flex_wrap_mobile = "nowrap";
  }
}

/**
 * Mutate emitted child containers so flex-row clusters shrink-wrap.
 * No-op for grid parents, column parents, or children with explicit widths.
 */
export function applyFlexRowChildShrinkWrap(
  parentSettings: ElementorSettings,
  children: NativeElementDraft[],
): void {
  if (parentSettings.container_type === "grid") return;
  if (!isRowDirection(parentSettings.flex_direction)) return;

  const stackOnTablet = isColumnDirection(parentSettings.flex_direction_tablet);
  const stackOnMobile = isColumnDirection(parentSettings.flex_direction_mobile);

  for (const child of children) {
    if (child.elType !== "container") continue;
    const s = child.settings;
    if (!isFullContentWidth(s)) continue;
    if (hasExplicitWidth(s)) continue;

    s.width = { ...AUTO_WIDTH };
    s.width_mobile = stackOnMobile ? { ...FULL_WIDTH } : { ...AUTO_WIDTH };

    if (stackOnTablet) {
      s.width_tablet = { ...FULL_WIDTH };
    }
  }
}

/**
 * Ensure short HTML chrome (nav links / CTAs) does not wrap mid-label when
 * a flex-row parent still squeezes. Appends to existing scoped style when present.
 */
export function ensureHtmlWhiteSpaceNowrap(child: NativeElementDraft): void {
  if (child.widgetType !== "html") return;
  const raw = child.settings.html;
  if (typeof raw !== "string" || raw.length === 0) return;
  if (/white-space\s*:\s*nowrap/i.test(raw)) return;

  const classMatch = raw.match(/\b(nte-fb-[a-z0-9]+)\b/i);
  if (!classMatch) return;
  const scope = classMatch[1]!;
  const rule = `.${scope}{white-space:nowrap}`;

  if (/<style[\s>]/i.test(raw)) {
    child.settings.html = raw.replace(
      /<style([^>]*)>([\s\S]*?)<\/style>/i,
      (_m, attrs: string, css: string) => {
        if (/white-space\s*:/i.test(css)) {
          return `<style${attrs}>${css}</style>`;
        }
        return `<style${attrs}>${css}${rule}</style>`;
      },
    );
    return;
  }

  child.settings.html = `${raw}<style>${rule}</style>`;
}

/**
 * Mutate direct leaf widgets in a flex-row so they hug content
 * (`_element_width: "auto"`), countering Elementor's row flex-grow default.
 */
export function applyFlexRowLeafShrinkWrap(
  parentSettings: ElementorSettings,
  children: NativeElementDraft[],
): void {
  if (parentSettings.container_type === "grid") return;
  if (!isRowDirection(parentSettings.flex_direction)) return;

  for (const child of children) {
    if (child.elType !== "widget") continue;
    const type = child.widgetType;
    if (!type || !LEAF_SHRINK_WIDGET_TYPES.has(type)) continue;
    if (child.settings._element_width != null) continue;

    child.settings._element_width = "auto";
    ensureHtmlWhiteSpaceNowrap(child);
  }
}
