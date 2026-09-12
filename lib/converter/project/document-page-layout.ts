/**
 * Elementor Free 4.2.4 page-layout (document settings.template).
 *
 * Verified Free templates from modules/page-templates/module.php @ 4.2.4:
 * - elementor_header_footer → "Elementor Full Width"
 * - elementor_canvas → "Elementor Canvas"
 * - elementor_theme → "Theme"
 *
 * `settings.template` is synced to `_wp_page_template` on document save
 * (core/settings/page/manager.php). This is Free — not Pro.
 *
 * Project conversion only. convertSource / section-input stay unchanged.
 */

import type { ElementorDocument, ElementorElement } from "../../rules/native/types";

/** Free 4.2.4 page template ids (Page Layout control). */
export const ELEMENTOR_FREE_PAGE_TEMPLATES = {
  /** Elementor Full Width — theme chrome kept; content escapes theme column. */
  fullWidth: "elementor_header_footer",
  /** Elementor Canvas — blank page, no theme header/footer. */
  canvas: "elementor_canvas",
  /** Theme template — host theme content column applies. */
  theme: "elementor_theme",
  /** Kit / WP default. */
  default: "default",
} as const;

export type ElementorFreePageTemplate =
  (typeof ELEMENTOR_FREE_PAGE_TEMPLATES)[keyof typeof ELEMENTOR_FREE_PAGE_TEMPLATES];

/**
 * Project-layer page layout policy.
 * - auto: emit Full Width only when the route document shows full-bleed landing evidence
 * - full-width / canvas: always emit that Free template
 * - off: never set document settings.template
 */
export type DocumentPageLayoutMode = "auto" | "full-width" | "canvas" | "off";

const ALLOWED_TEMPLATES = new Set<string>(
  Object.values(ELEMENTOR_FREE_PAGE_TEMPLATES),
);

export function isAllowedElementorFreePageTemplate(
  value: string,
): value is ElementorFreePageTemplate {
  return ALLOWED_TEMPLATES.has(value);
}

function walkElements(
  elements: ElementorElement[] | undefined,
  visit: (el: ElementorElement) => void,
): void {
  for (const el of elements ?? []) {
    visit(el);
    walkElements(el.elements, visit);
  }
}

function isFullViewportMinHeight(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as { size?: unknown; unit?: unknown };
  const size = Number(v.size);
  const unit = String(v.unit ?? "").toLowerCase();
  if (!Number.isFinite(size)) return false;
  return (unit === "vh" || unit === "dvh") && size >= 100;
}

function hasBackgroundImageUrl(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const url = (value as { url?: unknown }).url;
  return typeof url === "string" && url.trim().length > 0;
}

/**
 * True when a Free Container looks like a full-bleed landing shell:
 * content_width full + (cover background image OR full-viewport min-height).
 * Does not treat arbitrary w-full / width:100% as evidence.
 */
export function isFullBleedLandingContainer(el: ElementorElement): boolean {
  if (el.elType !== "container") return false;
  const s = el.settings ?? {};
  if (s.content_width !== "full") return false;
  return (
    hasBackgroundImageUrl(s.background_image) ||
    isFullViewportMinHeight(s.min_height)
  );
}

/** Scan an emitted document for full-bleed landing evidence. */
export function documentHasFullBleedLandingEvidence(
  document: ElementorDocument,
): boolean {
  let found = false;
  walkElements(document.content, (el) => {
    if (found) return;
    if (isFullBleedLandingContainer(el)) found = true;
  });
  return found;
}

/**
 * Resolve which Free page template (if any) to emit for a project route document.
 * When auto cannot distinguish Canvas vs Full Width, prefers Full Width.
 */
export function resolveProjectPageTemplate(
  mode: DocumentPageLayoutMode,
  document: ElementorDocument,
): ElementorFreePageTemplate | undefined {
  if (mode === "off") return undefined;
  if (mode === "full-width") return ELEMENTOR_FREE_PAGE_TEMPLATES.fullWidth;
  if (mode === "canvas") return ELEMENTOR_FREE_PAGE_TEMPLATES.canvas;
  // auto
  if (!documentHasFullBleedLandingEvidence(document)) return undefined;
  return ELEMENTOR_FREE_PAGE_TEMPLATES.fullWidth;
}

/**
 * Return a new document with Free `settings.template` applied (immutable).
 * No-op when template is undefined.
 */
export function applyDocumentPageLayout(
  document: ElementorDocument,
  template: ElementorFreePageTemplate | undefined,
): ElementorDocument {
  if (!template) return document;
  if (!isAllowedElementorFreePageTemplate(template)) return document;

  return {
    ...document,
    settings: {
      ...(document.settings ?? {}),
      template,
    },
  };
}
