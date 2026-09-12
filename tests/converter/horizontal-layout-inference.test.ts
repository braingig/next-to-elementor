/**
 * Horizontal layout inference for Free containers (flex row + small grids).
 */

import { describe, expect, it } from "vitest";
import {
  convertSource,
  loadElementorFreeCatalog,
  type ElementorDocument,
} from "@/lib/converter";

const catalog = loadElementorFreeCatalog("4.2.4");

function walkElements(
  doc: ElementorDocument,
  visit: (el: {
    elType: string;
    widgetType?: string;
    settings: Record<string, unknown>;
    elements?: unknown[];
  }) => void,
) {
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as {
      elType: string;
      widgetType?: string;
      settings: Record<string, unknown>;
      elements?: unknown[];
    };
    visit(n);
    for (const c of n.elements ?? []) walk(c);
  };
  for (const root of doc.content ?? []) walk(root);
}

function convert(source: string) {
  return convertSource({ source, language: "tsx", catalog });
}

describe("horizontal layout inference", () => {
  it("infers flex-direction row for inline link cluster (nav map wrap)", () => {
    const result = convert(`
const LINKS = [
  { href: "#home", label: "Home" },
  { href: "#services", label: "Services" },
  { href: "#faq", label: "FAQ" },
];
export default function Page() {
  return (
    <nav className="flex items-center gap-7">
      {LINKS.map((l) => (
        <a key={l.href} href={l.href}>{l.label}</a>
      ))}
      <a href="#quote">Get a Free Quote</a>
    </nav>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    let mapWrap:
      | {
          settings: Record<string, unknown>;
          elements?: Array<{
            widgetType?: string;
            settings?: Record<string, unknown>;
          }>;
        }
      | undefined;
    walkElements(doc, (el) => {
      if (
        el.elType === "container" &&
        Array.isArray(el.elements) &&
        el.elements.length >= 3 &&
        (el.elements as { widgetType?: string }[]).every(
          (c) => c.widgetType === "html" || c.elType === "widget",
        )
      ) {
        const kids = el.elements as { widgetType?: string }[];
        if (kids.filter((k) => k.widgetType === "html").length >= 3) {
          mapWrap = el;
        }
      }
    });
    expect(mapWrap).toBeDefined();
    expect(mapWrap!.settings.flex_direction).toBe("row");
    const htmlKids = (mapWrap!.elements ?? []).filter(
      (c) => c.widgetType === "html",
    );
    expect(htmlKids.length).toBeGreaterThanOrEqual(3);
    for (const kid of htmlKids) {
      expect(kid.settings?._element_width).toBe("auto");
      expect(String(kid.settings?.html ?? "")).toMatch(/white-space\s*:\s*nowrap/);
    }
  });

  it("does not force flex-col stacks to row", () => {
    const result = convert(`
export default function Page() {
  return (
    <section className="flex flex-col gap-8">
      <h2>Title</h2>
      <p>Body copy that should stay stacked.</p>
      <button type="button">Action</button>
    </section>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const root = doc.content[0]!;
    expect(root.settings.flex_direction).toBe("column");
  });

  it("does not invent row for multi-child section without horizontal cues", () => {
    const result = convert(`
export default function Page() {
  return (
    <div>
      <h2>One</h2>
      <p>Two</p>
      <p>Three</p>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const root = doc.content[0]!;
    // Defaulted flex with heading/text children — leave unset (Elementor column)
    // or only set row if cues/cluster; must NOT be row.
    expect(root.settings.flex_direction).not.toBe("row");
  });

  it("converts 2-child header chrome grid to flex space-between", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="grid items-center gap-4 max-w-7xl">
      <a href="#home">Logo</a>
      <nav className="flex items-center gap-4">
        <a href="#a">A</a>
        <a href="#b">B</a>
      </nav>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const root = doc.content[0]!;
    expect(root.settings.container_type).toBe("flex");
    expect(root.settings.flex_direction).toBe("row");
    expect(root.settings.flex_justify_content).toBe("space-between");
    expect(root.settings.grid_columns_grid).toBeUndefined();
  });

  it("converts 3-child header chrome grid to flex space-between (not 3fr)", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="mx-auto grid max-w-7xl items-center gap-4 px-4 py-3">
      <a href="#home">Logo</a>
      <nav className="flex items-center gap-7">
        <a href="#home">Home</a>
        <a href="#faq">FAQ</a>
      </nav>
      <div className="flex items-center gap-2">
        <a href="#quote">Quote</a>
      </div>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    let bar: { settings: Record<string, unknown> } | undefined;
    walkElements(doc, (el) => {
      if (
        Array.isArray(el.elements) &&
        el.elements.length === 3 &&
        (el.settings.container_type === "flex" ||
          el.settings.container_type === "grid")
      ) {
        bar = el;
      }
    });
    expect(bar).toBeDefined();
    expect(bar!.settings.container_type).toBe("flex");
    expect(bar!.settings.flex_direction).toBe("row");
    expect(bar!.settings.flex_justify_content).toBe("space-between");
    expect(bar!.settings.grid_columns_grid).toBeUndefined();
  });

  it("still infers equal fr for non-chrome 2-child grids", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="grid gap-4">
      <div><h3>A</h3><p>One</p></div>
      <div><h3>B</h3><p>Two</p></div>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const root = doc.content[0]!;
    expect(root.settings.container_type).toBe("grid");
    expect(root.settings.grid_columns_grid).toEqual({ unit: "fr", size: 2 });
  });

  it("keeps explicit grid-cols-3", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div>A</div>
      <div>B</div>
      <div>C</div>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const root = doc.content[0]!;
    expect(root.settings.grid_columns_grid).toEqual({ unit: "fr", size: 3 });
  });

  it("does not force card maps into a horizontal row", () => {
    const result = convert(`
const CARDS = [
  { title: "A", body: "One" },
  { title: "B", body: "Two" },
  { title: "C", body: "Three" },
];
export default function Page() {
  return (
    <section className="flex flex-col gap-6">
      {CARDS.map((c) => (
        <article key={c.title}>
          <h3>{c.title}</h3>
          <p>{c.body}</p>
        </article>
      ))}
    </section>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    let mapGroup: { settings: Record<string, unknown> } | undefined;
    walkElements(doc, (el) => {
      if (
        el.elType === "container" &&
        Array.isArray(el.elements) &&
        el.elements.length === 3 &&
        (el.elements as { elType?: string }[]).every((c) => c.elType === "container")
      ) {
        mapGroup = el;
      }
    });
    expect(mapGroup).toBeDefined();
    expect(mapGroup!.settings.flex_direction).not.toBe("row");
  });

  it("items-center gap without flex-col still gets row when display flex", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="flex items-center gap-4">
      <a href="#a">A</a>
      <a href="#b">B</a>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    expect(doc.content[0]!.settings.flex_direction).toBe("row");
  });
});
