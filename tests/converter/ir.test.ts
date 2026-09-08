import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  IR_SCHEMA_VERSION,
  IrDocumentSchema,
  IrNodeSchema,
  canonicalizeIrJson,
  normalizeIrDocument,
  parseIrDocument,
  safeParseIrDocument,
  type IrDocument,
  type IrNode,
} from "@/lib/converter";

const FIXTURES_DIR = path.join(
  process.cwd(),
  "tests/converter/fixtures/ir",
);

function loadFixture(name: string): unknown {
  const filePath = path.join(FIXTURES_DIR, name);
  return JSON.parse(readFileSync(filePath, "utf8")) as unknown;
}

function listFixtureFiles(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function walkNodes(node: IrNode, visit: (node: IrNode) => void): void {
  visit(node);
  for (const child of node.children) {
    walkNodes(child, visit);
  }
}

describe("IR schema Phase 2", () => {
  it("uses IR schema version 0.2.0", () => {
    expect(IR_SCHEMA_VERSION).toBe("0.2.0");
  });

  it("accepts a valid heading document", () => {
    const doc = parseIrDocument({
      version: "0.2.0",
      root: {
        id: "h1",
        kind: "heading",
        props: { level: 1, text: "Hello" },
        children: [],
      },
    });
    expect(doc.root.kind).toBe("heading");
    expect(doc.meta.sourceLanguage).toBe("unknown");
    expect(doc.diagnostics).toEqual([]);
  });

  it("accepts nested containers with mixed children", () => {
    const nested: IrNode = {
      id: "root",
      kind: "container",
      props: { as: "section" },
      children: [
        {
          id: "inner",
          kind: "container",
          props: {},
          children: [
            {
              id: "t",
              kind: "text",
              props: { text: "Hi" },
              children: [],
            },
            {
              id: "b",
              kind: "button",
              props: { text: "Go", href: "/" },
              children: [],
            },
          ],
        },
      ],
    };
    expect(IrNodeSchema.parse(nested).children).toHaveLength(1);
  });

  it("accepts style groups and open responsive breakpoint keys", () => {
    const styleDoc = parseIrDocument({
      version: "0.2.0",
      root: {
        id: "c",
        kind: "container",
        props: {},
        style: {
          layout: { display: "flex", gap: "8px" },
          typography: { color: "#111" },
          box: { padding: "16px" },
          border: { radius: "4px" },
          background: { color: "#fff" },
          responsive: {
            sm: { box: { padding: "8px" } },
            tablet: { layout: { flexDirection: "column" } },
          },
        },
        children: [],
      },
    });
    expect(styleDoc.root.style?.responsive?.sm?.box?.padding).toBe("8px");
    expect(styleDoc.root.style?.responsive?.tablet?.layout?.flexDirection).toBe(
      "column",
    );
  });

  it("preserves provenance metadata (classes, attributes, inline styles, loc)", () => {
    const doc = parseIrDocument({
      version: "0.2.0",
      root: {
        id: "n",
        kind: "text",
        props: { text: "x" },
        provenance: {
          sourcePath: "app/Hero.tsx",
          htmlTag: "p",
          componentName: "HeroCopy",
          classNames: ["lead", "text-lg"],
          inlineStyleRaw: "color:red",
          attributes: { "data-testid": "hero-copy" },
          loc: { line: 10, column: 2, endLine: 10, endColumn: 40 },
        },
        children: [],
      },
    });
    expect(doc.root.provenance?.classNames).toEqual(["lead", "text-lg"]);
    expect(doc.root.provenance?.attributes?.["data-testid"]).toBe("hero-copy");
    expect(doc.root.provenance?.inlineStyleRaw).toBe("color:red");
    expect(doc.root.provenance?.loc?.line).toBe(10);
  });

  it("accepts unsupported and uncertain states", () => {
    const doc = parseIrDocument({
      version: "0.2.0",
      root: {
        id: "root",
        kind: "container",
        props: {},
        children: [
          {
            id: "u",
            kind: "unsupported",
            props: {
              reasonCode: "unknown-component",
              message: "Cannot map WidgetX",
              originalSummary: "<WidgetX />",
            },
            children: [],
          },
          {
            id: "q",
            kind: "group",
            status: "uncertain",
            uncertainty: {
              reasonCode: "semantic-ambiguous",
              message: "Role unclear",
            },
            props: {},
            children: [],
          },
        ],
      },
    });
    expect(doc.root.children[0]?.kind).toBe("unsupported");
    expect(doc.root.children[1]?.status).toBe("uncertain");
  });

  it("rejects uncertain nodes without uncertainty.message", () => {
    const result = safeParseIrDocument({
      version: "0.2.0",
      root: {
        id: "q",
        kind: "group",
        status: "uncertain",
        props: {},
        children: [],
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid IR (wrong version, bad heading level, Elementor fields not in schema)", () => {
    expect(
      safeParseIrDocument({
        version: "0.1.0",
        root: {
          id: "h",
          kind: "heading",
          props: { level: 1, text: "x" },
          children: [],
        },
      }).success,
    ).toBe(false);

    expect(
      safeParseIrDocument({
        version: "0.2.0",
        root: {
          id: "h",
          kind: "heading",
          props: { level: 9, text: "x" },
          children: [],
        },
      }).success,
    ).toBe(false);

    expect(
      safeParseIrDocument({
        version: "0.2.0",
        root: {
          id: "h",
          kind: "heading",
          props: { level: 1, text: "x" },
          widgetType: "heading",
          children: [],
        },
      }).success,
    ).toBe(false);
  });

  it("normalizes deterministically regardless of key/class/diagnostic order", () => {
    const a = {
      version: "0.2.0" as const,
      diagnostics: [
        {
          severity: "warning" as const,
          code: "b",
          message: "second",
          nodeId: "n",
        },
        {
          severity: "warning" as const,
          code: "a",
          message: "first",
          nodeId: "n",
        },
      ],
      root: {
        id: "n",
        kind: "container" as const,
        props: {},
        provenance: {
          classNames: ["z-class", "a-class"],
          attributes: { b: "2", a: "1" },
        },
        notes: ["beta", "alpha"],
        style: {
          layout: { gap: "8px", display: "flex" },
          responsive: {
            md: { box: { padding: "8px" } },
            sm: { box: { padding: "4px" } },
          },
        },
        children: [],
      },
    };

    const b = {
      version: "0.2.0" as const,
      diagnostics: [...a.diagnostics].reverse(),
      root: {
        ...a.root,
        provenance: {
          classNames: ["a-class", "z-class"],
          attributes: { a: "1", b: "2" },
        },
        notes: ["alpha", "beta"],
        style: {
          layout: { display: "flex", gap: "8px" },
          responsive: {
            sm: { box: { padding: "4px" } },
            md: { box: { padding: "8px" } },
          },
        },
      },
    };

    expect(canonicalizeIrJson(a)).toBe(canonicalizeIrJson(b));
    const normalized = normalizeIrDocument(a);
    expect(normalized.root.provenance?.classNames).toEqual([
      "a-class",
      "z-class",
    ]);
    expect(normalized.diagnostics.map((d) => d.code)).toEqual(["a", "b"]);
    expect(Object.keys(normalized.root.style?.responsive ?? {})).toEqual([
      "md",
      "sm",
    ]);
  });

  it("strips empty style groups during normalization", () => {
    const normalized = normalizeIrDocument({
      version: "0.2.0",
      root: {
        id: "n",
        kind: "text",
        props: { text: "x" },
        style: {
          box: {},
          layout: { display: "block" },
          responsive: { sm: { box: {} } },
        },
        children: [],
      },
    });
    expect(normalized.root.style?.box).toBeUndefined();
    expect(normalized.root.style?.layout?.display).toBe("block");
    expect(normalized.root.style?.responsive).toBeUndefined();
  });
});

describe("IR fixture corpus", () => {
  const files = listFixtureFiles();

  it("includes the required fixture coverage set", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "simple-heading.json",
        "paragraph.json",
        "image.json",
        "button.json",
        "icon.json",
        "divider.json",
        "spacer.json",
        "nested-containers.json",
        "flex-layout.json",
        "responsive-styles.json",
        "inline-styles.json",
        "css-classes.json",
        "tailwind-classes.json",
        "unsupported-ambiguous.json",
      ]),
    );
  });

  it.each(files)("validates fixture %s", (file) => {
    const raw = loadFixture(file);
    const parsed = IrDocumentSchema.parse(raw);
    expect(parsed.version).toBe(IR_SCHEMA_VERSION);

    const normalized = normalizeIrDocument(raw);
    expect(canonicalizeIrJson(normalized)).toBe(canonicalizeIrJson(raw));

    // Fixtures must remain Elementor-agnostic.
    const json = JSON.stringify(raw);
    expect(json).not.toMatch(/"elType"/);
    expect(json).not.toMatch(/"widgetType"/);
  });

  it("nested-containers fixture contains heading, text, and button under containers", () => {
    const doc = parseIrDocument(loadFixture("nested-containers.json")) as IrDocument;
    const kinds: string[] = [];
    walkNodes(doc.root, (node) => kinds.push(node.kind));
    expect(kinds.filter((k) => k === "container").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(kinds).toContain("heading");
    expect(kinds).toContain("text");
    expect(kinds).toContain("button");
  });

  it("unsupported-ambiguous fixture includes uncertain and unsupported nodes", () => {
    const doc = parseIrDocument(
      loadFixture("unsupported-ambiguous.json"),
    ) as IrDocument;
    const statuses: Array<string | undefined> = [];
    const kinds: string[] = [];
    walkNodes(doc.root, (node) => {
      kinds.push(node.kind);
      statuses.push(node.status);
    });
    expect(kinds).toContain("unsupported");
    expect(kinds).toContain("html-embed");
    expect(statuses).toContain("uncertain");
  });

  it("tailwind fixture preserves source classes and unresolved diagnostic", () => {
    const doc = parseIrDocument(loadFixture("tailwind-classes.json"));
    expect(doc.root.provenance?.classNames).toContain("md:flex-col");
    expect(doc.root.provenance?.classNames).toContain("shadow-mystery");
    expect(
      doc.diagnostics.some((d) => d.code === "unknown-tailwind-class"),
    ).toBe(true);
  });
});
