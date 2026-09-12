import { describe, expect, it } from "vitest";
import { convertSource } from "@/lib/converter/convert-source";
import { loadElementorFreeCatalog } from "@/lib/converter/catalog";
import type { ElementorDocument } from "@/lib/converter/rules/native/types";

const catalog = loadElementorFreeCatalog("4.2.4");

type El = {
  elType?: string;
  widgetType?: string;
  settings?: Record<string, unknown>;
  elements?: El[];
};

function walk(els: El[] | undefined, visit: (el: El) => void) {
  for (const el of els ?? []) {
    visit(el);
    walk(el.elements, visit);
  }
}

function convert(source: string) {
  return convertSource({ language: "tsx", catalog, source });
}

function findJustifyBetweenRow(doc: ElementorDocument): El | undefined {
  let hit: El | undefined;
  walk(doc.content as El[], (el) => {
    if (
      el.elType === "container" &&
      el.settings?.flex_direction === "row" &&
      el.settings?.flex_justify_content === "space-between"
    ) {
      hit = el;
    }
  });
  return hit;
}

describe("flex-row child container shrink-wrap", () => {
  it("navbar-like justify-between row shrink-wraps nested child containers", () => {
    const result = convert(`
export default function Nav() {
  return (
    <nav className="border-b px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between py-4">
        <div>
          <p>Brand</p>
        </div>
        <div className="flex items-center gap-8">
          <a href="/a" className="text-sm">One</a>
          <a href="/b" className="text-sm">Two</a>
        </div>
        <a href="/go" className="rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white">
          Get Started
        </a>
      </div>
    </nav>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const row = findJustifyBetweenRow(doc);
    expect(row).toBeTruthy();
    expect(row?.settings?.flex_wrap).toBe("nowrap");
    expect(row?.settings?.flex_wrap_mobile).toBe("nowrap");
    const childContainers = (row?.elements ?? []).filter(
      (c) => c.elType === "container",
    );
    expect(childContainers.length).toBeGreaterThanOrEqual(2);
    for (const child of childContainers) {
      expect(child.settings?.content_width).toBe("full");
      expect(child.settings?.width).toEqual({ size: "auto", unit: "custom" });
      // Mobile must also be auto — Elementor gates desktop width behind 768px
      // and frontend CSS forces 100% below that.
      expect(child.settings?.width_mobile).toEqual({
        size: "auto",
        unit: "custom",
      });
    }
  });

  it("keeps structural / section containers full-width (no auto width)", () => {
    const result = convert(`
export default function Page() {
  return (
    <section className="bg-white">
      <div className="px-6 py-24">
        <h1>Hello</h1>
      </div>
    </section>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const sectionish: El[] = [];
    walk(doc.content as El[], (el) => {
      if (el.elType === "container" && el.settings?.html_tag === "section") {
        sectionish.push(el);
      }
    });
    expect(sectionish.length).toBeGreaterThanOrEqual(1);
    for (const el of sectionish) {
      expect(el.settings?.content_width).toBe("full");
      expect(el.settings?.width).toBeUndefined();
    }
  });

  it("preserves explicit percentage widths on hero columns", () => {
    const result = convert(`
export default function Hero() {
  return (
    <div className="flex flex-col gap-14 lg:flex-row lg:items-center">
      <div className="w-full lg:w-1/2">
        <h1>Left</h1>
      </div>
      <div className="w-full lg:w-1/2">
        <p>Right</p>
      </div>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const halfWidth: El[] = [];
    walk(doc.content as El[], (el) => {
      const w = el.settings?.width as { size?: number; unit?: string } | undefined;
      if (w?.size === 50 && w.unit === "%") halfWidth.push(el);
    });
    expect(halfWidth.length).toBe(2);
    for (const el of halfWidth) {
      // Must remain numeric half-width — not overwritten by auto.
      expect(el.settings?.width).toEqual({ unit: "%", size: 50 });
    }
  });

  it("does not force auto width onto feature grid children", () => {
    const result = convert(`
export default function Features() {
  return (
    <div className="mt-12 grid gap-6 md:grid-cols-3">
      <div className="rounded-2xl border p-7">
        <h3>A</h3>
        <p>One</p>
      </div>
      <div className="rounded-2xl border p-7">
        <h3>B</h3>
        <p>Two</p>
      </div>
      <div className="rounded-2xl border p-7">
        <h3>C</h3>
        <p>Three</p>
      </div>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    let grid: El | undefined;
    walk(doc.content as El[], (el) => {
      if (el.settings?.container_type === "grid" || el.settings?.grid_columns_grid) {
        grid = el;
      }
    });
    expect(grid).toBeTruthy();
    for (const child of grid?.elements ?? []) {
      if (child.elType !== "container") continue;
      expect(child.settings?.width).toBeUndefined();
      expect(child.settings?.content_width).toBe("full");
    }
  });

  it("restores full width on mobile when parent flex-col stacks", () => {
    const result = convert(`
export default function Split() {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <div className="rounded-xl border p-6">
        <h3>Card A</h3>
      </div>
      <div className="rounded-xl border p-6">
        <h3>Card B</h3>
      </div>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    let row: El | undefined;
    walk(doc.content as El[], (el) => {
      if (
        el.elType === "container" &&
        el.settings?.flex_direction === "row" &&
        el.settings?.flex_direction_mobile === "column"
      ) {
        row = el;
      }
    });
    expect(row).toBeTruthy();
    const kids = (row?.elements ?? []).filter((c) => c.elType === "container");
    expect(kids.length).toBe(2);
    for (const child of kids) {
      expect(child.settings?.width).toEqual({ size: "auto", unit: "custom" });
      expect(child.settings?.width_mobile).toEqual({ size: 100, unit: "%" });
    }
  });
});

describe("flex-row leaf widget shrink-wrap", () => {
  it("sets _element_width auto on html links in a flex row", () => {
    const result = convert(`
export default function Nav() {
  return (
    <nav className="flex items-center gap-7">
      <a href="#home">Home</a>
      <a href="#services">Services</a>
      <a href="#quote" className="rounded-full px-5 py-2">Get a Free Quote</a>
    </nav>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const htmls: El[] = [];
    walk(doc.content as El[], (el) => {
      if (el.widgetType === "html") htmls.push(el);
    });
    expect(htmls.length).toBeGreaterThanOrEqual(3);
    for (const h of htmls) {
      expect(h.settings?._element_width).toBe("auto");
      expect(String(h.settings?.html ?? "")).toMatch(/white-space\s*:\s*nowrap/);
    }
  });

  it("does not force _element_width auto inside flex-col stacks", () => {
    const result = convert(`
export default function Stack() {
  return (
    <section className="flex flex-col gap-4">
      <a href="#a">One</a>
      <a href="#b">Two</a>
    </section>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const htmls: El[] = [];
    walk(doc.content as El[], (el) => {
      if (el.widgetType === "html") htmls.push(el);
    });
    expect(htmls.length).toBe(2);
    for (const h of htmls) {
      expect(h.settings?._element_width).toBeUndefined();
    }
  });
});
