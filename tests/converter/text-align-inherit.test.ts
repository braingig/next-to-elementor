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

function findWidgets(doc: ElementorDocument, widgetType: string): El[] {
  const out: El[] = [];
  walk(doc.content as El[], (el) => {
    if (el.widgetType === widgetType) out.push(el);
  });
  return out;
}

function convert(source: string) {
  return convertSource({ language: "tsx", catalog, source });
}

describe("container text-align inheritance (Free Container has no align)", () => {
  it("propagates parent text-center to Heading and Text Editor", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="text-center">
      <h2>Feature Title</h2>
      <p>Feature body copy</p>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const headings = findWidgets(doc, "heading");
    const texts = findWidgets(doc, "text-editor");
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(texts.length).toBeGreaterThanOrEqual(1);
    expect(headings[0]?.settings?.align).toBe("center");
    expect(texts[0]?.settings?.align).toBe("center");
  });

  it("propagates responsive text-center lg:text-left with Elementor cascade", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="text-center lg:text-left">
      <h2>Intro Title</h2>
      <p>Intro body</p>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const heading = findWidgets(doc, "heading")[0];
    const text = findWidgets(doc, "text-editor")[0];
    expect(heading).toBeTruthy();
    expect(text).toBeTruthy();

    // Desktop-first: lg → desktop left; tablet/mobile keep center (pre-lg).
    expect(heading?.settings?.align).toBe("start"); // heading remaps left → start
    expect(heading?.settings?.align_tablet).toBe("center");
    expect(heading?.settings?.align_mobile).toBe("center");

    expect(text?.settings?.align).toBe("left");
    expect(text?.settings?.align_tablet).toBe("center");
    expect(text?.settings?.align_mobile).toBe("center");
  });

  it("propagates through intermediate wrapper containers to nested text", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="text-center lg:text-left">
      <div>
        <p>Nested eyebrow</p>
      </div>
      <h2>Title</h2>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const texts = findWidgets(doc, "text-editor");
    const eyebrow = texts.find((t) =>
      String(t.settings?.editor ?? "").includes("Nested eyebrow"),
    );
    expect(eyebrow?.settings?.align).toBe("left");
    expect(eyebrow?.settings?.align_tablet).toBe("center");
    expect(eyebrow?.settings?.align_mobile).toBe("center");
  });

  it("does not apply parent text-align to buttons or images", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="text-center">
      <h2>Title</h2>
      <a href="/go" className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white">Go</a>
      <img src="/x.png" alt="x" className="w-24" />
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const heading = findWidgets(doc, "heading")[0];
    const buttons = findWidgets(doc, "button");
    const images = findWidgets(doc, "image");

    expect(heading?.settings?.align).toBe("center");
    for (const btn of buttons) {
      expect(btn.settings?.align).toBeUndefined();
    }
    for (const img of images) {
      expect(img.settings?.align).toBeUndefined();
    }
  });

  it("preserves child-owned text alignment over parent", () => {
    const result = convert(`
export default function Page() {
  return (
    <div className="text-center">
      <h2 className="text-right">Own align</h2>
      <p className="text-left">Own left</p>
    </div>
  );
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const heading = findWidgets(doc, "heading")[0];
    const text = findWidgets(doc, "text-editor")[0];
    expect(heading?.settings?.align).toBe("end");
    expect(text?.settings?.align).toBe("left");
    expect(heading?.settings?.align_tablet).toBeUndefined();
    expect(text?.settings?.align_tablet).toBeUndefined();
  });

  it("preserves existing direct heading text-center without parent", () => {
    const result = convert(`
export default function Page() {
  return <h2 className="text-center">Direct</h2>;
}
`);
    const doc = result.elementorJson as ElementorDocument;
    const heading = findWidgets(doc, "heading")[0];
    expect(heading?.settings?.align).toBe("center");
  });
});
