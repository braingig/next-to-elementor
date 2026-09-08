import { describe, expect, it } from "vitest";
import {
  CATALOG_SCHEMA_VERSION,
  ELEMENTOR_DOCUMENT_VERSION,
  ElementorFreeCatalogSchema,
  canUseControl,
  canUseWidget,
  checkFreeCompliance,
  getCatalogWidget,
  isProDenylisted,
  listAvailableElementorFreeCatalogTargets,
  loadElementorFreeCatalog,
  SUPPORTED_ELEMENTOR_FREE_TARGETS,
} from "@/lib/converter";

const MVP_WIDGET_IDS = [
  "container",
  "heading",
  "text-editor",
  "image",
  "button",
  "icon",
  "divider",
  "spacer",
  "html",
] as const;

describe("Elementor Free catalog 4.2.4", () => {
  it("loads exactly target 4.2.4 with classic document version 0.4", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    expect(catalog.elementorTarget).toBe("4.2.4");
    expect(catalog.version).toBe(CATALOG_SCHEMA_VERSION);
    expect(catalog.elementorDocumentVersion).toBe(ELEMENTOR_DOCUMENT_VERSION);
    expect(catalog.emissionModel).toBe("classic-json");
    expect(catalog.layoutPolicy).toBe("container-only");
    expect(catalog.source?.tag).toBe("4.2.4");
  });

  it("lists only explicit supported targets and refuses unknown versions", () => {
    expect(listAvailableElementorFreeCatalogTargets()).toEqual([
      ...SUPPORTED_ELEMENTOR_FREE_TARGETS,
    ]);
    expect(() => loadElementorFreeCatalog("3.32.0")).toThrow(
      /Unsupported Elementor Free catalog target/,
    );
    expect(() => loadElementorFreeCatalog("4.2.3")).toThrow(
      /Unsupported Elementor Free catalog target/,
    );
  });

  it("validates the assembled catalog against the Zod schema", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    expect(() => ElementorFreeCatalogSchema.parse(catalog)).not.toThrow();
  });

  it("catalogues every MVP widget with a valid Free widgetType/id", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    for (const id of MVP_WIDGET_IDS) {
      const widget = getCatalogWidget(catalog, id);
      expect(widget, `missing widget ${id}`).toBeDefined();
      expect(widget!.id).toBe(id);
      expect(widget!.tier).toBe("free");
      expect(["supported", "partial"]).toContain(widget!.status);
      expect(widget!.controls.length).toBeGreaterThan(0);
      if (id === "container") {
        expect(widget!.elType).toBe("container");
        expect(widget!.supportsChildren).toBe(true);
      } else {
        expect(widget!.elType).toBe("widget");
      }
    }
  });

  it("ensures every catalogued control has the expected structure", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    const allControls = [
      ...catalog.globalControls,
      ...catalog.widgets.flatMap((widget) => widget.controls),
    ];
    expect(allControls.length).toBeGreaterThan(20);
    for (const control of allControls) {
      expect(control.id.length).toBeGreaterThan(0);
      expect(control.valueTypes.length).toBeGreaterThan(0);
      expect(["free", "pro"]).toContain(control.tier);
      expect(["verified", "partial", "unverified"]).toContain(
        control.verificationStatus,
      );
      expect(control.tier).toBe("free");
    }
  });

  it("does not place Pro-only widgets in the MVP Free widget list", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    const proWidgets = catalog.proDenylist
      .filter((entry) => entry.kind === "widget")
      .map((entry) => entry.id);
    for (const widget of catalog.widgets) {
      expect(proWidgets).not.toContain(widget.id);
      expect(canUseWidget(catalog, widget.id)).toBe(true);
    }
  });

  it("Pro denylist catches known Pro widgetTypes and controls", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    for (const id of ["form", "slides", "posts", "nav-menu", "lottie"]) {
      expect(isProDenylisted(catalog, id)?.kind).toBe("widget");
      expect(canUseWidget(catalog, id)).toBe(false);
    }
    for (const id of ["custom_css", "_attributes", "__dynamic__"]) {
      expect(isProDenylisted(catalog, id)?.kind).toBe("control");
    }
    expect(isProDenylisted(catalog, "theme-builder")?.kind).toBe("feature");
    expect(isProDenylisted(catalog, "dynamic-tags")?.kind).toBe("feature");
  });

  it("compliance gate rejects Pro widgets, Pro controls, legacy layout, and dynamic values", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");

    expect(
      checkFreeCompliance(catalog, {
        elType: "widget",
        widgetType: "form",
        settings: {},
      }).passed,
    ).toBe(false);

    expect(
      checkFreeCompliance(catalog, {
        elType: "widget",
        widgetType: "heading",
        settings: { title: "Hello", custom_css: ".x{}" },
      }).passed,
    ).toBe(false);

    expect(
      checkFreeCompliance(catalog, {
        elType: "section",
        settings: {},
      }).passed,
    ).toBe(false);

    expect(
      checkFreeCompliance(catalog, {
        elType: "widget",
        widgetType: "heading",
        settings: {
          title: "Hello",
          __dynamic__: { title: ["dynamic-tag"] },
        },
      }).passed,
    ).toBe(false);
  });

  it("compliance gate accepts a Free heading with catalogued controls", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    expect(canUseControl(catalog, "heading", "title")).toBe(true);
    expect(canUseControl(catalog, "heading", "_margin")).toBe(true);
    expect(canUseControl(catalog, "heading", "custom_css")).toBe(false);

    const result = checkFreeCompliance(catalog, {
      elType: "widget",
      widgetType: "heading",
      settings: {
        title: "Hello",
        header_size: "h1",
        align: "center",
        align_tablet: "start",
        _padding: {
          unit: "px",
          top: "10",
          right: "10",
          bottom: "10",
          left: "10",
          isLinked: true,
        },
      },
    });
    expect(result.violations).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it("compliance gate accepts Free container layout settings", () => {
    const catalog = loadElementorFreeCatalog("4.2.4");
    const result = checkFreeCompliance(catalog, {
      elType: "container",
      settings: {
        container_type: "flex",
        flex_direction: "column",
        padding: {
          unit: "px",
          top: "20",
          right: "20",
          bottom: "20",
          left: "20",
          isLinked: true,
        },
      },
    });
    expect(result.passed).toBe(true);
  });
});
