import { describe, expect, it } from "vitest";
import {
  convertSource,
  loadElementorFreeCatalog,
  mapIrStyleToSettings,
  resolveTailwindClasses,
  type ElementorDocument,
} from "@/lib/converter";

const catalog = loadElementorFreeCatalog("4.2.4");

function settingsFromClasses(className: string) {
  const { style } = resolveTailwindClasses(className.split(/\s+/).filter(Boolean));
  return mapIrStyleToSettings(style, {
    catalog,
    widgetId: "container",
    spacingPrefix: "",
  });
}

describe("flex default direction + mobile-first cascade", () => {
  it("flex without flex-row emits row", () => {
    const s = settingsFromClasses("flex items-center justify-between");
    expect(s.flex_direction).toBe("row");
    expect(s.flex_align_items).toBe("center");
    expect(s.flex_justify_content).toBe("space-between");
  });

  it("flex-row emits row", () => {
    expect(settingsFromClasses("flex flex-row").flex_direction).toBe("row");
  });

  it("flex-col emits column", () => {
    expect(settingsFromClasses("flex flex-col").flex_direction).toBe("column");
  });

  it("flex-col sm:flex-row → desktop row / mobile column", () => {
    const s = settingsFromClasses("flex flex-col sm:flex-row");
    expect(s.flex_direction).toBe("row");
    expect(s.flex_direction_mobile).toBe("column");
    expect(s.flex_direction_tablet).toBeUndefined();
  });

  it("flex-col md:flex-row → desktop row, tablet row, mobile column", () => {
    const s = settingsFromClasses("flex flex-col gap-6 md:flex-row");
    expect(s.flex_direction).toBe("row");
    expect(s.flex_direction_tablet).toBe("row");
    expect(s.flex_direction_mobile).toBe("column");
  });

  it("w-full lg:w-1/2 → desktop 50% / mobile 100%", () => {
    const s = settingsFromClasses("w-full lg:w-1/2");
    expect(s.width).toEqual({ unit: "%", size: 50 });
    expect(s.width_mobile).toEqual({ unit: "%", size: 100 });
  });

  it("max-w-6xl → boxed container + boxed_width", () => {
    const s = settingsFromClasses("max-w-6xl mx-auto");
    expect(s.content_width).toBe("boxed");
    expect(s.boxed_width).toEqual({ unit: "rem", size: 72 });
  });

  it("flex items-center justify-between stays horizontal", () => {
    const result = convertSource({
      language: "tsx",
      source: `export function Nav() {
  return (
    <nav className="flex items-center justify-between px-6">
      <div>Logo</div>
      <div>Links</div>
    </nav>
  );
}`,
      catalog,
    });
    const root = (result.elementorJson as ElementorDocument).content[0]!;
    expect(root.settings.flex_direction).toBe("row");
    expect(root.settings.flex_align_items).toBe("center");
    expect(root.settings.flex_justify_content).toBe("space-between");
  });
});
