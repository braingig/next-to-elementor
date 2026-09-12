/**
 * Responsive visibility: Tailwind hidden / lg:flex → Elementor hide_* switchers.
 */

import { describe, expect, it } from "vitest";
import {
  convertSource,
  loadElementorFreeCatalog,
  mapIrStyleToSettings,
  resolveTailwindClasses,
  type ElementorDocument,
  type ElementorElement,
  type IrStyle,
} from "@/lib/converter";
import {
  applyResponsiveVisibilityHides,
  cascadeMobileFirstToElementorTiers,
} from "@/lib/converter/rules/native/styles/map-style";

const catalog = loadElementorFreeCatalog("4.2.4");

function walk(els: ElementorElement[] | undefined, visit: (el: ElementorElement) => void) {
  for (const el of els ?? []) {
    visit(el);
    walk(el.elements, visit);
  }
}

describe("responsive visibility (hide_*)", () => {
  it("maps hidden lg:flex to hide_mobile + hide_tablet", () => {
    const { style } = resolveTailwindClasses(["hidden", "items-center", "lg:flex"]);
    const settings = mapIrStyleToSettings(style, {
      catalog,
      widgetId: "container",
      spacingPrefix: "",
    });
    expect(settings.hide_mobile).toBe("hidden-mobile");
    expect(settings.hide_tablet).toBe("hidden-tablet");
    expect(settings.hide_desktop).toBeUndefined();
  });

  it("maps flex lg:hidden to hide_desktop", () => {
    const { style } = resolveTailwindClasses(["flex", "items-center", "gap-2", "lg:hidden"]);
    const settings = mapIrStyleToSettings(style, {
      catalog,
      widgetId: "container",
      spacingPrefix: "",
    });
    expect(settings.hide_desktop).toBe("hidden-desktop");
    expect(settings.hide_mobile).toBeUndefined();
    expect(settings.hide_tablet).toBeUndefined();
  });

  it("maps hidden md:flex to hide_mobile only", () => {
    const { style } = resolveTailwindClasses(["hidden", "md:flex"]);
    const settings = mapIrStyleToSettings(style, {
      catalog,
      widgetId: "button",
      spacingPrefix: "_",
    });
    expect(settings.hide_mobile).toBe("hidden-mobile");
    expect(settings.hide_desktop).toBeUndefined();
  });

  it("maps bare hidden to all hide_* devices", () => {
    const style: IrStyle = { layout: { display: "none" } };
    const tiers = cascadeMobileFirstToElementorTiers(style);
    const settings: Record<string, unknown> = {};
    applyResponsiveVisibilityHides(style, tiers, {
      catalog,
      widgetId: "container",
      spacingPrefix: "",
    }, settings);
    expect(settings.hide_desktop).toBe("hidden-desktop");
    expect(settings.hide_tablet).toBe("hidden-tablet");
    expect(settings.hide_mobile).toBe("hidden-mobile");
  });

  it("emits mutually exclusive header CTAs with hide_* in convertSource", () => {
    const result = convertSource({
      source: `
        export default function Header() {
          return (
            <div className="flex items-center gap-4">
              <nav className="hidden items-center gap-7 lg:flex">
                <a href="#quote" className="rounded-full bg-red-600 px-5 py-2">Get a Free Quote</a>
              </nav>
              <div className="flex items-center gap-2 lg:hidden">
                <a href="#quote" className="rounded-full bg-red-600 px-4 py-2">Free Quote</a>
              </div>
            </div>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "responsive-header-ctas",
    });
    const doc = result.elementorJson as ElementorDocument;
    const buttons: Array<{ title: string; hide: Record<string, unknown> }> = [];
    walk(doc.content, (el) => {
      if (el.widgetType !== "button") return;
      const title = String(el.settings?.title ?? el.settings?.text ?? "");
      if (!title.includes("Quote")) return;
      buttons.push({
        title,
        hide: {
          hide_desktop: el.settings?.hide_desktop,
          hide_tablet: el.settings?.hide_tablet,
          hide_mobile: el.settings?.hide_mobile,
        },
      });
    });
    // Prefer hide on the wrapping containers; buttons may inherit visually via parent.
    const containers: Array<Record<string, unknown>> = [];
    walk(doc.content, (el) => {
      if (el.elType !== "container") return;
      if (
        el.settings?.hide_desktop ||
        el.settings?.hide_tablet ||
        el.settings?.hide_mobile
      ) {
        containers.push({
          hide_desktop: el.settings?.hide_desktop,
          hide_tablet: el.settings?.hide_tablet,
          hide_mobile: el.settings?.hide_mobile,
        });
      }
    });
    expect(containers.length).toBeGreaterThanOrEqual(2);
    expect(
      containers.some(
        (c) => c.hide_mobile === "hidden-mobile" && c.hide_tablet === "hidden-tablet",
      ),
    ).toBe(true);
    expect(containers.some((c) => c.hide_desktop === "hidden-desktop")).toBe(true);
    expect(buttons.map((b) => b.title).sort()).toEqual([
      "Free Quote",
      "Get a Free Quote",
    ]);
  });
});
