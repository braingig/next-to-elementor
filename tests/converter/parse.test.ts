import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ReactParseError,
  analyzeReactSource,
  canonicalizeIrJson,
  normalizeIrDocument,
  parseReactSource,
  type IrNode,
} from "@/lib/converter";

const FIXTURES_DIR = path.join(
  process.cwd(),
  "tests/converter/fixtures/parse",
);

function loadSource(name: string): string {
  return readFileSync(path.join(FIXTURES_DIR, name), "utf8");
}

function listParseFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".jsx"))
    .sort();
}

function walk(node: IrNode, visit: (n: IrNode) => void): void {
  visit(node);
  for (const child of node.children) {
    walk(child, visit);
  }
}

function kinds(node: IrNode): string[] {
  const out: string[] = [];
  walk(node, (n) => out.push(n.kind));
  return out;
}

describe("parseReactSource", () => {
  it("parses valid JSX", () => {
    const parsed = parseReactSource(
      `export default function A(){ return <div>Hi</div>; }`,
      { language: "jsx", sourcePath: "A.jsx" },
    );
    expect(parsed.language).toBe("jsx");
    expect(parsed.ast.type).toBe("File");
  });

  it("parses valid TSX with types", () => {
    const parsed = parseReactSource(loadSource("17-tsx-typed.tsx"), {
      language: "tsx",
      sourcePath: "17-tsx-typed.tsx",
    });
    expect(parsed.language).toBe("tsx");
  });

  it("throws ReactParseError for malformed JSX without crashing the process", () => {
    expect(() =>
      parseReactSource(`export default function Broken(){ return <div>; }`, {
        language: "tsx",
      }),
    ).toThrow(ReactParseError);

    try {
      parseReactSource(`export default function Broken(){ return <div>; }`, {
        language: "tsx",
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ReactParseError);
      expect((error as ReactParseError).code).toBe("parse-error");
      expect((error as ReactParseError).message).toMatch(/parse error/i);
    }
  });
});

describe("analyzeReactSource fixtures", () => {
  it("includes the required fixture coverage set", () => {
    const files = listParseFixtures();
    expect(files).toEqual(
      expect.arrayContaining([
        "01-simple-heading.tsx",
        "02-paragraph.tsx",
        "03-image.tsx",
        "04-button.tsx",
        "05-link.tsx",
        "06-nested-containers.tsx",
        "07-classname.tsx",
        "08-inline-style.tsx",
        "09-fragments.tsx",
        "10-static-jsx-expression.tsx",
        "11-dynamic-expression.tsx",
        "12-conditional-jsx.tsx",
        "13-array-static-jsx.tsx",
        "14-custom-component-with-source.tsx",
        "15-unknown-custom-component.tsx",
        "16-unsupported-jsx.tsx",
      ]),
    );
  });

  it("maps a simple heading", () => {
    const { document } = analyzeReactSource(loadSource("01-simple-heading.tsx"), {
      sourcePath: "01-simple-heading.tsx",
    });
    expect(document.root.kind).toBe("heading");
    if (document.root.kind === "heading") {
      expect(document.root.props.text).toBe("Welcome");
      expect(document.root.props.level).toBe(1);
    }
    expect(document.root.provenance?.htmlTag).toBe("h1");
    expect(document.root.provenance?.loc?.line).toBeGreaterThan(0);
  });

  it("maps a paragraph", () => {
    const { document } = analyzeReactSource(loadSource("02-paragraph.tsx"), {
      sourcePath: "02-paragraph.tsx",
    });
    expect(document.root.kind).toBe("text");
    if (document.root.kind === "text") {
      expect(document.root.props.text).toContain("Build sections");
    }
  });

  it("maps an image with attributes", () => {
    const { document } = analyzeReactSource(loadSource("03-image.tsx"), {
      sourcePath: "03-image.tsx",
    });
    expect(document.root.kind).toBe("image");
    if (document.root.kind === "image") {
      expect(document.root.props.src).toBe("/images/hero.jpg");
      expect(document.root.props.alt).toBe("Product screenshot");
      expect(document.root.props.width).toBe(1200);
    }
    expect(document.root.provenance?.attributes?.loading).toBe("lazy");
  });

  it("maps button and link", () => {
    const button = analyzeReactSource(loadSource("04-button.tsx"), {
      sourcePath: "04-button.tsx",
    }).document;
    expect(button.root.kind).toBe("button");
    if (button.root.kind === "button") {
      expect(button.root.props.text).toBe("Get started");
    }

    const link = analyzeReactSource(loadSource("05-link.tsx"), {
      sourcePath: "05-link.tsx",
    }).document;
    expect(link.root.kind).toBe("link");
    if (link.root.kind === "link") {
      expect(link.root.props.href).toBe("/docs");
      expect(link.root.props.text).toBe("Read the docs");
    }
  });

  it("maps nested containers", () => {
    const { document } = analyzeReactSource(
      loadSource("06-nested-containers.tsx"),
      { sourcePath: "06-nested-containers.tsx" },
    );
    const k = kinds(document.root);
    expect(k.filter((x) => x === "container").length).toBeGreaterThanOrEqual(2);
    expect(k).toContain("heading");
    expect(k).toContain("text");
    expect(k).toContain("button");
  });

  it("captures className tokens without resolving CSS", () => {
    const { document } = analyzeReactSource(loadSource("07-classname.tsx"), {
      sourcePath: "07-classname.tsx",
    });
    expect(document.root.provenance?.classNames).toEqual([
      "hero",
      "hero--dark",
      "u-stack",
    ]);
    expect(document.root.provenance?.attributes?.id).toBe("hero");
    expect(document.root.style).toEqual({});
  });

  it("captures inline style as raw provenance, not Elementor values", () => {
    const { document } = analyzeReactSource(loadSource("08-inline-style.tsx"), {
      sourcePath: "08-inline-style.tsx",
    });
    expect(document.root.provenance?.inlineStyleRaw).toContain("color:#0f172a");
    expect(document.root.provenance?.inlineStyleRaw).toContain("font-size:18px");
    expect(document.root.style).toEqual({});
  });

  it("flattens fragments into a group", () => {
    const { document } = analyzeReactSource(loadSource("09-fragments.tsx"), {
      sourcePath: "09-fragments.tsx",
    });
    expect(document.root.kind).toBe("group");
    expect(document.root.notes).toContain("jsx-fragment");
    expect(kinds(document.root)).toEqual(
      expect.arrayContaining(["heading", "text"]),
    );
  });

  it("resolves static JSX expressions", () => {
    const { document } = analyzeReactSource(
      loadSource("10-static-jsx-expression.tsx"),
      { sourcePath: "10-static-jsx-expression.tsx" },
    );
    const texts: string[] = [];
    walk(document.root, (n) => {
      if (n.kind === "heading") texts.push(n.props.text);
      if (n.kind === "text") texts.push(n.props.text);
    });
    expect(texts).toEqual(expect.arrayContaining(["Hello", "Welcome aboard", "42"]));
    expect(
      document.diagnostics.every((d) => d.code !== "dynamic-content"),
    ).toBe(true);
  });

  it("marks dynamic expressions unsupported without evaluating them", () => {
    const { document } = analyzeReactSource(
      loadSource("11-dynamic-expression.tsx"),
      { sourcePath: "11-dynamic-expression.tsx" },
    );
    const unsupported: IrNode[] = [];
    walk(document.root, (n) => {
      if (n.kind === "unsupported") unsupported.push(n);
    });
    expect(unsupported.length).toBeGreaterThan(0);
    expect(
      unsupported.some(
        (n) =>
          n.kind === "unsupported" && n.props.reasonCode === "dynamic-content",
      ),
    ).toBe(true);
    // Ensure we did not invent resolved dynamic text
    const json = JSON.stringify(document);
    expect(json).not.toContain("Ada");
  });

  it("resolves static conditionals and rejects dynamic ones", () => {
    const { document } = analyzeReactSource(loadSource("12-conditional-jsx.tsx"), {
      sourcePath: "12-conditional-jsx.tsx",
    });
    const texts: string[] = [];
    walk(document.root, (n) => {
      if (n.kind === "text") texts.push(n.props.text);
      if (n.kind === "heading") texts.push(n.props.text);
    });
    expect(texts).toContain("Shown when true");
    expect(texts).toContain("Yes branch");
    expect(texts).not.toContain("Hidden when false");
    expect(texts).not.toContain("No branch");

    const unsupported: string[] = [];
    walk(document.root, (n) => {
      if (n.kind === "unsupported") unsupported.push(n.props.reasonCode);
    });
    expect(unsupported).toContain("dynamic-content");
  });

  it("supports arrays of static JSX", () => {
    const { document } = analyzeReactSource(
      loadSource("13-array-static-jsx.tsx"),
      { sourcePath: "13-array-static-jsx.tsx" },
    );
    const texts: string[] = [];
    walk(document.root, (n) => {
      if (n.kind === "text") texts.push(n.props.text);
    });
    expect(texts).toEqual(["First", "Second", "Third"]);
  });

  it("inlines custom components when source is available in-file", () => {
    const { document } = analyzeReactSource(
      loadSource("14-custom-component-with-source.tsx"),
      { sourcePath: "14-custom-component-with-source.tsx" },
    );
    const k = kinds(document.root);
    expect(k).toContain("heading");
    expect(k).toContain("text");
    expect(
      document.diagnostics.some((d) => d.code === "inlined-local-component"),
    ).toBe(true);
  });

  it("marks unknown custom components unsupported", () => {
    const { document } = analyzeReactSource(
      loadSource("15-unknown-custom-component.tsx"),
      { sourcePath: "15-unknown-custom-component.tsx" },
    );
    const unknown: IrNode[] = [];
    walk(document.root, (n) => {
      if (n.kind === "unsupported") unknown.push(n);
    });
    expect(
      unknown.some(
        (n) =>
          n.kind === "unsupported" &&
          n.props.reasonCode === "unknown-component",
      ),
    ).toBe(true);
  });

  it("marks map() and other unsupported constructs without approximation", () => {
    const { document } = analyzeReactSource(loadSource("16-unsupported-jsx.tsx"), {
      sourcePath: "16-unsupported-jsx.tsx",
    });
    const codes: string[] = [];
    walk(document.root, (n) => {
      if (n.kind === "unsupported") codes.push(n.props.reasonCode);
    });
    expect(codes).toContain("dynamic-children");
  });

  it("analyzes all fixtures into valid IR without Elementor fields", () => {
    for (const file of listParseFixtures()) {
      const { document } = analyzeReactSource(loadSource(file), {
        sourcePath: file,
      });
      expect(document.version).toBe("0.2.0");
      const json = JSON.stringify(document);
      expect(json).not.toMatch(/"elType"/);
      expect(json).not.toMatch(/"widgetType"/);
      // Round-trip normalize
      expect(canonicalizeIrJson(document)).toBe(
        canonicalizeIrJson(normalizeIrDocument(document)),
      );
    }
  });

  it("is deterministic for the same input", () => {
    const source = loadSource("06-nested-containers.tsx");
    const a = analyzeReactSource(source, { sourcePath: "06-nested-containers.tsx" });
    const b = analyzeReactSource(source, { sourcePath: "06-nested-containers.tsx" });
    expect(canonicalizeIrJson(a.document)).toBe(canonicalizeIrJson(b.document));
  });
});

describe("security / no execution", () => {
  it("does not execute function calls or hooks in source", () => {
    let executed = false;
    const boom = () => {
      executed = true;
      throw new Error("should not run");
    };
    // The analyzer must not call into this binding — it only sees source text.
    void boom;

    const source = `
      function evil(){ throw new Error("executed"); }
      export default function App(){
        return <div>{evil()}</div>;
      }
    `;
    const { document } = analyzeReactSource(source, { sourcePath: "evil.tsx" });
    expect(executed).toBe(false);
    const unsupported: string[] = [];
    walk(document.root, (n) => {
      if (n.kind === "unsupported") unsupported.push(n.props.reasonCode);
    });
    expect(unsupported).toContain("dynamic-content");
  });
});
