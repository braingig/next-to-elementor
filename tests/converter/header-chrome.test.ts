/**
 * Generic header chrome conversion — layout, spacing, logo size, nav,
 * responsive visibility, CTAs, tel links, icons, sr-only.
 *
 * Neutral fixtures only (no project-specific names).
 */

import { describe, expect, it } from "vitest";
import {
  convertSource,
  resolveTailwindUtility,
  type ElementorDocument,
  type ElementorElement,
} from "@/lib/converter";

function walk(
  els: ElementorElement[] | undefined,
  visit: (el: ElementorElement) => void,
) {
  for (const el of els ?? []) {
    visit(el);
    walk(el.elements, visit);
  }
}

function findWidgets(doc: ElementorDocument, type: string): ElementorElement[] {
  const hits: ElementorElement[] = [];
  walk(doc.content, (el) => {
    if (el.widgetType === type) hits.push(el);
  });
  return hits;
}

describe("tailwind utilities for header chrome", () => {
  it("maps space-x / gap-x to columnGap and whitespace-nowrap / shrink-0", () => {
    expect(resolveTailwindUtility("space-x-7")).toEqual({
      layout: { columnGap: "1.75rem" },
    });
    expect(resolveTailwindUtility("gap-x-4")).toEqual({
      layout: { columnGap: "1rem" },
    });
    expect(resolveTailwindUtility("gap-y-2")).toEqual({
      layout: { rowGap: "0.5rem" },
    });
    expect(resolveTailwindUtility("whitespace-nowrap")).toEqual({
      typography: { whiteSpace: "nowrap" },
    });
    expect(resolveTailwindUtility("shrink-0")).toEqual({
      layout: { flexShrink: "0" },
    });
    expect(resolveTailwindUtility("min-w-0")).toEqual({
      box: { minWidth: "0px" },
    });
    expect(resolveTailwindUtility("justify-between")).toEqual({
      layout: { justifyContent: "space-between" },
    });
    expect(resolveTailwindUtility("items-center")).toEqual({
      layout: { alignItems: "center" },
    });
  });

  it("maps object-fit / object-position / max-h / arbitrary header grids", () => {
    expect(resolveTailwindUtility("object-contain")).toEqual({
      box: { objectFit: "contain" },
    });
    expect(resolveTailwindUtility("object-cover")).toEqual({
      box: { objectFit: "cover" },
    });
    expect(resolveTailwindUtility("object-left")).toEqual({
      box: { objectPosition: "left center" },
    });
    expect(resolveTailwindUtility("max-h-14")).toEqual({
      box: { maxHeight: "3.5rem" },
    });
    expect(
      resolveTailwindUtility("grid-cols-[minmax(0,1fr)_auto]"),
    ).toEqual({
      layout: { gridTemplateColumns: "minmax(0,1fr)_auto" },
    });
  });
});

describe("convertSource generic header chrome", () => {
  it("maps a linked logo image with h-* to native Image height + custom link", () => {
    const result = convertSource({
      source: `
        export default function SiteHeader() {
          return (
            <a href="/" className="flex items-center shrink-0">
              <img
                src="https://cdn.example.com/company-mark.png"
                alt="Company mark"
                className="h-12 w-auto object-contain"
                width={750}
                height={500}
              />
            </a>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-logo-size",
    });
    const doc = result.elementorJson as ElementorDocument;
    const images = findWidgets(doc, "image");
    expect(images.length).toBe(1);
    const img = images[0]!;
    expect(img.settings.link_to).toBe("custom");
    expect((img.settings.link as { url?: string }).url).toBe("/");
    expect((img.settings.image as { alt?: string }).alt).toBe("Company mark");
    expect(img.settings.height).toEqual({ unit: "rem", size: 3 });
    expect(img.settings["object-fit"]).toBe("contain");
    // Intrinsic width/height must not become Elementor width/height from attrs alone.
    expect(img.settings.width).toBeUndefined();
  });

  it("maps logo object-position and max-h without inventing intrinsic width", () => {
    const result = convertSource({
      source: `
        export default function Mark() {
          return (
            <img
              src="https://cdn.example.com/mark.png"
              alt="Mark"
              className="max-h-10 w-auto object-contain object-left"
              width={900}
              height={600}
            />
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-logo-max-h",
    });
    const img = findWidgets(result.elementorJson as ElementorDocument, "image")[0]!;
    expect(img.settings.height).toEqual({ unit: "rem", size: 2.5 });
    expect(img.settings["object-fit"]).toBe("contain");
    expect(img.settings["object-position"]).toBe("left center");
    expect(img.settings.width).toBeUndefined();
  });

  it("preserves nav row flex, gap, nowrap, and responsive hide", () => {
    const result = convertSource({
      source: `
        export default function Nav() {
          return (
            <nav className="hidden items-center gap-7 lg:flex whitespace-nowrap" aria-label="Main">
              <a href="#a" className="text-sm font-medium">About</a>
              <a href="#b" className="text-sm font-medium">Work</a>
              <a href="#c" className="text-sm font-medium">Contact</a>
            </nav>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-nav-row",
    });
    const doc = result.elementorJson as ElementorDocument;
    let nav: ElementorElement | undefined;
    walk(doc.content, (el) => {
      if (el.elType === "container" && el.settings.html_tag === "nav") {
        nav = el;
      }
    });
    expect(nav).toBeDefined();
    expect(nav!.settings.container_type).toBe("flex");
    expect(nav!.settings.flex_direction).toBe("row");
    expect(nav!.settings.flex_align_items).toBe("center");
    expect(nav!.settings.flex_wrap).toBe("nowrap");
    expect(nav!.settings.flex_wrap_mobile).toBe("nowrap");
    expect(nav!.settings.flex_gap).toMatchObject({
      isLinked: true,
      unit: "rem",
      column: "1.75",
      row: "1.75",
    });
    // hidden lg:flex → hide on mobile/tablet
    expect(nav!.settings.hide_mobile).toBeTruthy();
    expect(nav!.settings.hide_tablet).toBeTruthy();
    // Plain nav links stay Custom HTML (no invented Nav Menu widget)
    expect(findWidgets(doc, "html").length).toBeGreaterThanOrEqual(3);
  });

  it("maps dual desktop/mobile CTAs with responsive hide and tel link", () => {
    const result = convertSource({
      source: `
        const PHONE_HREF = "tel:+15551234567";
        export default function HeaderCtas() {
          return (
            <div className="flex items-center gap-3">
              <a
                href={PHONE_HREF}
                className="hidden items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold lg:flex"
              >
                Call us
              </a>
              <a
                href="#quote"
                className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white lg:hidden"
              >
                Free Quote
              </a>
            </div>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-dual-cta",
    });
    const doc = result.elementorJson as ElementorDocument;
    const buttons = findWidgets(doc, "button");
    expect(buttons.length).toBeGreaterThanOrEqual(2);

    const tel = buttons.find(
      (b) =>
        (b.settings.link as { url?: string } | undefined)?.url?.startsWith(
          "tel:",
        ),
    );
    expect(tel).toBeDefined();
    expect(tel!.settings.text).toBe("Call us");
    expect(tel!.settings.hide_mobile).toBeTruthy();
    expect(tel!.settings.hide_tablet).toBeTruthy();

    const quote = buttons.find(
      (b) => (b.settings.link as { url?: string } | undefined)?.url === "#quote",
    );
    expect(quote).toBeDefined();
    expect(quote!.settings.text).toBe("Free Quote");
    expect(quote!.settings.hide_desktop).toBeTruthy();
    expect(quote!.settings.background_color).toBe("#dc2626");
    expect(quote!.settings.button_text_color).toBe("#ffffff");
  });

  it("maps named icon + text CTA to Free Button with selected_icon", () => {
    const result = convertSource({
      source: `
        export default function PhoneCta() {
          return (
            <a
              href="tel:+15551234567"
              className="flex items-center gap-2 rounded-full border border-white px-4 py-2 text-sm font-semibold text-white"
            >
              <svg data-icon="phone" className="h-4 w-4" viewBox="0 0 24 24" />
              (555) 123-4567
            </a>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-icon-cta",
    });
    const buttons = findWidgets(result.elementorJson as ElementorDocument, "button");
    expect(buttons.length).toBe(1);
    const btn = buttons[0]!;
    expect(btn.settings.text).toBe("(555) 123-4567");
    expect((btn.settings.link as { url?: string }).url).toBe("tel:+15551234567");
    expect(btn.settings.selected_icon).toMatchObject({
      value: "fas fa-phone",
      library: "fa-solid",
    });
  });

  it("does not leak sr-only text as a visible heading/text widget", () => {
    const result = convertSource({
      source: `
        export default function Brand() {
          return (
            <a href="/" className="flex items-center gap-3">
              <img src="https://cdn.example.com/mark.svg" alt="Acme" className="h-10 w-auto" />
              <span className="sr-only">Acme Corporation</span>
            </a>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-sr-only",
    });
    const doc = result.elementorJson as ElementorDocument;
    const headings = findWidgets(doc, "heading");
    const texts = findWidgets(doc, "text-editor");
    const leaked = [...headings, ...texts].some((el) => {
      const t = String(el.settings.title ?? el.settings.editor ?? "");
      return /Acme Corporation/i.test(t);
    });
    expect(leaked).toBe(false);
    const images = findWidgets(doc, "image");
    expect(images.length).toBe(1);
    expect(images[0]!.settings.link_to).toBe("custom");
  });

  it("preserves header bar padding, justify-between, and fixed positioning", () => {
    const result = convertSource({
      source: `
        export default function Bar() {
          return (
            <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-4 px-4 py-3 bg-slate-900">
              <div className="shrink-0">
                <img src="https://cdn.example.com/mark.png" alt="Mark" className="h-10" />
              </div>
              <div className="flex items-center gap-4">
                <a href="#a" className="text-sm font-medium text-white">One</a>
                <a href="#b" className="text-sm font-medium text-white">Two</a>
              </div>
            </header>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-bar-layout",
    });
    const doc = result.elementorJson as ElementorDocument;
    // Fixed overlays escalate to Free HTML widget (native container position is unreliable).
    const htmlWidgets = findWidgets(doc, "html");
    expect(htmlWidgets.length).toBeGreaterThanOrEqual(1);
    const html = htmlWidgets.map((w) => String(w.settings.html)).join("\n");
    expect(html).toContain("<header");
    expect(html).toContain("position:fixed");
    expect(html).toContain("z-index:50");
    expect(html).toMatch(/justify-content\s*:\s*space-between/);
    expect(html).toMatch(/align-items\s*:\s*center/);
    expect(html).toContain("#0f172a");
    expect(html).toMatch(/padding/);
  });

  it("escalates unsupported 1fr+auto header grid to scoped custom HTML (no flex approximation)", () => {
    const result = convertSource({
      source: `
        export default function Chrome() {
          return (
            <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
              <img src="https://cdn.example.com/mark.png" alt="Mark" className="h-10 w-auto" />
              <nav className="flex items-center gap-4" aria-label="Main">
                <a href="#a" className="text-sm">A</a>
                <a href="#b" className="text-sm">B</a>
              </nav>
            </div>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-grid-chrome",
    });
    const doc = result.elementorJson as ElementorDocument;
    const htmlWidgets = findWidgets(doc, "html");
    expect(htmlWidgets.length).toBeGreaterThanOrEqual(1);
    const html = String(htmlWidgets[0]!.settings.html);
    expect(html).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(html).toContain("max-width:80rem");
    expect(html).toContain('alt="Mark"');
    expect(html).toContain("<nav");
    expect(html).toContain("<style>");
    // Must not invent a native flex approximation for unequal grid tracks.
    let inventedFlexChrome = false;
    walk(doc.content, (el) => {
      if (
        el.elType === "container" &&
        el.settings.container_type === "flex" &&
        el.settings.flex_justify_content === "start" &&
        el.settings.grid_columns_grid == null
      ) {
        const hasNav = el.elements?.some((c) => c.settings.html_tag === "nav");
        if (hasNav) inventedFlexChrome = true;
      }
    });
    expect(inventedFlexChrome).toBe(false);
  });

  it("escalates 1fr+auto chrome with complementary CTAs to custom HTML", () => {
    const result = convertSource({
      source: `
        export default function SiteChrome() {
          return (
            <header className="fixed inset-x-0 top-0 z-40 bg-slate-900">
              <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                <img src="https://cdn.example.com/mark.png" alt="Mark" className="h-10 w-auto" />
                <nav className="hidden lg:flex items-center gap-6" aria-label="Main">
                  <a href="#a" className="text-sm text-white">One</a>
                  <a href="#contact" className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">Get a Free Quote</a>
                </nav>
                <div className="lg:hidden">
                  <a href="#contact" className="rounded-full bg-red-600 px-3 py-2 text-sm font-semibold text-white">Free Quote</a>
                </div>
              </div>
            </header>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-1fr-auto-complementary",
    });
    const doc = result.elementorJson as ElementorDocument;
    // Fixed + unequal grid: whole chrome escalates to Free HTML (not a native outer container).
    const header = doc.content[0]!;
    expect(header.elType).toBe("widget");
    expect(header.widgetType).toBe("html");
    const htmlWidgets = findWidgets(doc, "html");
    expect(htmlWidgets.length).toBeGreaterThanOrEqual(1);
    const joined = htmlWidgets.map((w) => String(w.settings.html)).join("\n");
    expect(joined).toContain("position:fixed");
    expect(joined).toContain("grid-template-columns");
    expect(joined).toMatch(/minmax\(0,\s*1fr\)\s+auto/);
  });

  it("full-width fixed header + boxed inner: no default padding, nested isInner, width hierarchy", () => {
    const result = convertSource({
      source: `
        export default function SiteChrome() {
          return (
            <header className="fixed inset-x-0 top-0 z-40 bg-slate-900">
              <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
                <img src="https://cdn.example.com/mark.png" alt="Mark" className="h-10 w-auto" />
                <nav className="flex items-center gap-6" aria-label="Main">
                  <a href="#a" className="text-sm text-white">One</a>
                  <a href="#b" className="text-sm text-white">Two</a>
                </nav>
              </div>
            </header>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-full-boxed-hierarchy",
    });
    const doc = result.elementorJson as ElementorDocument;
    // Fixed overlay → Free HTML widget with scoped CSS (native fixed containers are unreliable).
    const root = doc.content[0]!;
    expect(root.elType).toBe("widget");
    expect(root.widgetType).toBe("html");
    const html = String(root.settings.html);
    expect(html).toContain("<header");
    expect(html).toContain("position:fixed");
    expect(html).toContain("z-index:40");
    expect(html).toContain("#0f172a");
    expect(html).toMatch(/max-width\s*:\s*80rem/);
    expect(html).toMatch(/justify-content\s*:\s*space-between/);
    expect(html).toMatch(/margin-left\s*:\s*auto/);
    expect(html).toMatch(/margin-right\s*:\s*auto/);
    // Source px/py only — padding present on the inner boxed row, not invented defaults.
    expect(html).toMatch(/padding/);
    expect(html).toContain("<nav");
    expect(html).toContain("<style>");
  });

  it("does not invent vertical empty space on a padding-less structural header wrapper", () => {
    const result = convertSource({
      source: `
        export default function Bar() {
          return (
            <header className="bg-white border-b">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-sm font-medium">Brand</span>
                <a href="#go" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white font-semibold">Go</a>
              </div>
            </header>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "header-no-default-pad",
    });
    const doc = result.elementorJson as ElementorDocument;
    const header = doc.content[0]!;
    expect(header.settings.padding).toMatchObject({
      top: "0",
      right: "0",
      bottom: "0",
      left: "0",
    });
    expect(header.settings.min_height).toBeUndefined();
    const inner = header.elements[0]!;
    expect(inner.isInner).toBe(true);
    expect(inner.settings.padding).toMatchObject({
      top: "0.5",
      bottom: "0.5",
      left: "1",
      right: "1",
    });
  });
});
