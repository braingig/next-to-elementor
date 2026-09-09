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
 */

const AUTO_WIDTH = { size: "auto", unit: "custom" } as const;
const FULL_WIDTH = { size: 100, unit: "%" } as const;

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
 */
export function applyFlexRowNowrapDefault(settings: ElementorSettings): void {
  if (!isRowDirection(settings.flex_direction)) return;
  if (hasExplicitWrap(settings)) return;
  settings.flex_wrap = "nowrap";
  settings.flex_wrap_mobile = "nowrap";
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
