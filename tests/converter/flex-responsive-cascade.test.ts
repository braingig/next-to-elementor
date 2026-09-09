import { describe, expect, it } from "vitest";
import {
  convertSource,
  loadElementorFreeCatalog,
  mapIrStyleToSettings,
  resolveTailwindClasses,
  resolveTailwindUtility,
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

  it("flex-col lg:flex-row → desktop row, tablet+mobile column", () => {
    const s = settingsFromClasses("flex flex-col gap-14 lg:flex-row");
    expect(s.flex_direction).toBe("row");
    expect(s.flex_direction_tablet).toBe("column");
    expect(s.flex_direction_mobile).toBe("column");
  });

  it("w-full md:w-1/2 → desktop/tablet 50%, mobile 100%", () => {
    const s = settingsFromClasses("w-full md:w-1/2");
    expect(s.width).toEqual({ unit: "%", size: 50 });
    expect(s.width_tablet).toEqual({ unit: "%", size: 50 });
    expect(s.width_mobile).toEqual({ unit: "%", size: 100 });
  });

  it("w-full lg:w-1/2 → desktop 50%, tablet+mobile 100%", () => {
    const s = settingsFromClasses("w-full lg:w-1/2");
    expect(s.width).toEqual({ unit: "%", size: 50 });
    expect(s.width_tablet).toEqual({ unit: "%", size: 100 });
    expect(s.width_mobile).toEqual({ unit: "%", size: 100 });
  });

  it("sm:flex-row with lg:flex-col keeps tablet at sm value", () => {
    const s = settingsFromClasses("flex flex-col sm:flex-row lg:flex-col");
    expect(s.flex_direction).toBe("column");
    expect(s.flex_direction_tablet).toBe("row");
    expect(s.flex_direction_mobile).toBe("column");
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

describe("grid-cols → grid_columns_grid", () => {
  it("grid-cols-3 emits Free grid_columns_grid with 3 fr tracks", () => {
    const s = settingsFromClasses("grid grid-cols-3 gap-6");
    expect(s.container_type).toBe("grid");
    expect(s.grid_columns_grid).toEqual({ unit: "fr", size: 3 });
    expect(s.flex_gap).toEqual({
      unit: "rem",
      column: "1.5",
      row: "1.5",
      isLinked: true,
    });
    expect(s.grid_columns_grid_mobile).toBeUndefined();
    expect(s.grid_columns_grid_tablet).toBeUndefined();
  });

  it("md:grid-cols-3 → desktop/tablet 3 cols, mobile 1 col", () => {
    const s = settingsFromClasses("grid gap-6 md:grid-cols-3");
    expect(s.container_type).toBe("grid");
    expect(s.grid_columns_grid).toEqual({ unit: "fr", size: 3 });
    expect(s.grid_columns_grid_tablet).toEqual({ unit: "fr", size: 3 });
    expect(s.grid_columns_grid_mobile).toEqual({ unit: "fr", size: 1 });
    expect(s.flex_gap).toEqual({
      unit: "rem",
      column: "1.5",
      row: "1.5",
      isLinked: true,
    });
  });

  it("grid-cols-1 md:grid-cols-3 uses base for mobile via cascade", () => {
    const s = settingsFromClasses("grid grid-cols-1 gap-4 md:grid-cols-3");
    expect(s.grid_columns_grid).toEqual({ unit: "fr", size: 3 });
    expect(s.grid_columns_grid_tablet).toEqual({ unit: "fr", size: 3 });
    expect(s.grid_columns_grid_mobile).toEqual({ unit: "fr", size: 1 });
  });

  it("unsupported grid-cols utilities stay unresolved", () => {
    expect(resolveTailwindUtility("grid-cols-none")).toBeNull();
    expect(resolveTailwindUtility("grid-cols-13")).toBeNull();
    expect(resolveTailwindUtility("grid-cols-[200px]")).toBeNull();
    const { style, unknown } = resolveTailwindClasses([
      "grid",
      "grid-cols-none",
      "md:grid-cols-13",
    ]);
    expect(style.layout?.display).toBe("grid");
    expect(style.layout?.gridTemplateColumns).toBeUndefined();
    expect(unknown).toEqual(
      expect.arrayContaining(["grid-cols-none", "md:grid-cols-13"]),
    );
  });

  it("convertSource preserves LandingSection-style feature grid", () => {
    const result = convertSource({
      language: "tsx",
      source: `export function Features() {
  return (
    <div className="mt-12 grid gap-6 md:grid-cols-3">
      <div>A</div>
      <div>B</div>
      <div>C</div>
    </div>
  );
}`,
      catalog,
    });
    const root = (result.elementorJson as ElementorDocument).content[0]!;
    expect(root.settings.container_type).toBe("grid");
    expect(root.settings.grid_columns_grid).toEqual({ unit: "fr", size: 3 });
    expect(root.settings.grid_columns_grid_tablet).toEqual({
      unit: "fr",
      size: 3,
    });
    expect(root.settings.grid_columns_grid_mobile).toEqual({
      unit: "fr",
      size: 1,
    });
    expect(root.settings.flex_gap).toEqual({
      unit: "rem",
      column: "1.5",
      row: "1.5",
      isLinked: true,
    });
  });
});
