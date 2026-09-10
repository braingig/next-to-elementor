import { describe, expect, it } from "vitest";
import {
  canonicalizeElementorJson,
  convertSectionInput,
  convertSource,
  normalizeVirtualFiles,
  normalizeVirtualPath,
  resolveEntryPath,
  resolveImportGraph,
  resolveModulePath,
  resolveSectionInput,
  SECTION_INPUT_LIMITS,
  validateElementorDocument,
  loadElementorFreeCatalog,
  type ElementorDocument,
} from "@/lib/converter";

const catalog = loadElementorFreeCatalog("4.2.4");

function assertValidDocument(json: unknown): asserts json is ElementorDocument {
  expect(json).not.toBeNull();
  const doc = json as ElementorDocument;
  expect(doc.version).toBe("0.4");
  const validation = validateElementorDocument(doc, catalog);
  expect(validation.passed).toBe(true);
}

describe("section-input Phase A: virtual paths + limits", () => {
  it("normalizes POSIX paths and strips . / .. safely", () => {
    expect(normalizeVirtualPath("HeroSection.tsx")).toBe("HeroSection.tsx");
    expect(normalizeVirtualPath("./components/Button.tsx")).toBe(
      "components/Button.tsx",
    );
    expect(normalizeVirtualPath("a/b/../c/./d.tsx")).toBe("a/c/d.tsx");
    expect(normalizeVirtualPath("foo\\bar.tsx")).toBe("foo/bar.tsx");
  });

  it("rejects traversal and absolute paths", () => {
    expect(normalizeVirtualPath("../escape.tsx")).toBeNull();
    expect(normalizeVirtualPath("a/../../b.tsx")).toBeNull();
    expect(normalizeVirtualPath("/abs.tsx")).toBeNull();
    expect(normalizeVirtualPath("C:\\Windows\\x.tsx")).toBeNull();
    expect(normalizeVirtualPath("file:foo.tsx")).toBeNull();
  });

  it("enforces file count and byte limits", () => {
    const tooMany: Record<string, string> = {};
    for (let i = 0; i < SECTION_INPUT_LIMITS.maxFiles + 1; i++) {
      tooMany[`f${i}.tsx`] = "export const A = () => <div/>;";
    }
    const count = normalizeVirtualFiles(tooMany);
    expect(count.diagnostics.some((d) => d.code === "file-count-limit")).toBe(
      true,
    );

    const huge = "x".repeat(SECTION_INPUT_LIMITS.maxFileBytes + 1);
    const fileLimit = normalizeVirtualFiles({ "Big.tsx": huge });
    expect(
      fileLimit.diagnostics.some((d) => d.code === "file-byte-limit"),
    ).toBe(true);
  });

  it("rejects empty maps and path collisions with different content", () => {
    expect(
      normalizeVirtualFiles({}).diagnostics.some((d) => d.code === "empty-section"),
    ).toBe(true);

    const collision = normalizeVirtualFiles({
      "a/../b.tsx": "one",
      "b.tsx": "two",
    });
    // a/../b escapes or normalizes — a/../b from root escapes → path-traversal
    // Use two keys that normalize to the same path:
    const same = normalizeVirtualFiles({
      "./Hero.tsx": "export const Hero = () => <h1>A</h1>;",
      "Hero.tsx": "export const Hero = () => <h1>B</h1>;",
    });
    expect(same.diagnostics.some((d) => d.code === "path-collision")).toBe(
      true,
    );
    void collision;
  });
});

describe("section-input Phase B: entry detection", () => {
  const hero = `export default function HeroSection() { return <h1>Hero</h1>; }`;
  const other = `export function Other() { return <h1>Other</h1>; }`;

  it("uses explicit entryPath", () => {
    const r = resolveEntryPath({
      files: {
        "HeroSection.tsx": hero,
        "Other.tsx": other,
      },
      entryPath: "Other.tsx",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entryPath).toBe("Other.tsx");
  });

  it("matches folder name HeroSection/HeroSection.tsx", () => {
    const r = resolveEntryPath({
      files: {
        "HeroSection/HeroSection.tsx": hero,
        "HeroSection/Other.tsx": other,
      },
      sectionName: "HeroSection",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entryPath).toBe("HeroSection/HeroSection.tsx");
  });

  it("matches root index.tsx", () => {
    const r = resolveEntryPath({
      files: {
        "index.tsx": hero,
        "Other.tsx": other,
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.entryPath).toBe("index.tsx");
  });

  it("returns ambiguous-entry with candidates", () => {
    const r = resolveEntryPath({
      files: {
        "A.tsx": hero,
        "B.tsx": other,
      },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.diagnostics[0]?.code).toBe("ambiguous-entry");
      expect(r.candidates).toEqual(["A.tsx", "B.tsx"]);
    }
  });

  it("returns missing-entry when no components", () => {
    const r = resolveEntryPath({
      files: { "readme.md": "# hi" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.diagnostics[0]?.code).toBe("missing-entry");
  });
});

describe("section-input Phase B: import resolution + graph", () => {
  it("resolves ./Component, extensions, and index files", () => {
    const files = {
      "Hero.tsx": `import Content from "./Content";
import Arrow from "./icons/Arrow";
export default function Hero() { return <div><Content /><Arrow /></div>; }`,
      "Content.tsx": `import Btn from "./components/Button";
export default function Content() { return <Btn />; }`,
      "components/Button.tsx": `export default function Button() { return <button>Go</button>; }`,
      "icons/Arrow/index.tsx": `export default function Arrow() { return <span>→</span>; }`,
    };

    expect(resolveModulePath(files, "Hero.tsx", "./Content")).toBe(
      "Content.tsx",
    );
    expect(resolveModulePath(files, "Hero.tsx", "./icons/Arrow")).toBe(
      "icons/Arrow/index.tsx",
    );
    expect(
      resolveModulePath(files, "Content.tsx", "./components/Button"),
    ).toBe("components/Button.tsx");

    const graph = resolveImportGraph({ files, entryPath: "Hero.tsx" });
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(graph.graph.nodes).toEqual([
      "components/Button.tsx",
      "Content.tsx",
      "Hero.tsx",
      "icons/Arrow/index.tsx",
    ]);
    expect(graph.knownComponentSources.Content).toContain("function Content");
    expect(graph.knownComponentSources.Btn).toContain("function Button");
    expect(graph.knownComponentSources.Arrow).toContain("function Arrow");
  });

  it("resolves ../Component from nested directories", () => {
    const files = {
      "Hero.tsx": `import X from "./nested/Child";
export default function Hero() { return <X />; }`,
      "nested/Child.tsx": `import Shared from "../Shared";
export default function Child() { return <Shared />; }`,
      "Shared.tsx": `export default function Shared() { return <p>S</p>; }`,
    };
    const graph = resolveImportGraph({ files, entryPath: "Hero.tsx" });
    expect(graph.ok).toBe(true);
    if (graph.ok) {
      expect(graph.bindingPaths.Shared).toBe("Shared.tsx");
    }
  });

  it("fails on missing dependency", () => {
    const files = {
      "Hero.tsx": `import Missing from "./Missing";
export default function Hero() { return <Missing />; }`,
    };
    const graph = resolveImportGraph({ files, entryPath: "Hero.tsx" });
    expect(graph.ok).toBe(false);
    if (!graph.ok) {
      expect(
        graph.diagnostics.some((d) => d.code === "missing-dependency"),
      ).toBe(true);
    }
  });

  it("fails on circular dependency with path diagnostic", () => {
    const files = {
      "A.tsx": `import B from "./B";
export default function A() { return <B />; }`,
      "B.tsx": `import A from "./A";
export default function B() { return <A />; }`,
    };
    const graph = resolveImportGraph({ files, entryPath: "A.tsx" });
    expect(graph.ok).toBe(false);
    if (!graph.ok) {
      const cycle = graph.diagnostics.find(
        (d) => d.code === "circular-dependency",
      );
      expect(cycle?.message).toContain("A.tsx → B.tsx → A.tsx");
    }
  });

  it("detects component binding collisions across different files", () => {
    const files = {
      "Hero.tsx": `import Button from "./components/Button";
import Other from "./shared/Button";
export default function Hero() { return <><Button /><Other /></>; }`,
      "components/Button.tsx": `export default function Button() { return <button>A</button>; }`,
      "shared/Button.tsx": `export default function Button() { return <button>B</button>; }`,
    };
    // Both default imports use different local names — no collision.
    const ok = resolveImportGraph({ files, entryPath: "Hero.tsx" });
    expect(ok.ok).toBe(true);

    const clash = resolveImportGraph({
      files: {
        "Hero.tsx": `import Button from "./components/Button";
import Button from "./shared/Button";
export default function Hero() { return <Button />; }`,
        "components/Button.tsx": `export default function Button() { return <button>A</button>; }`,
        "shared/Button.tsx": `export default function Button() { return <button>B</button>; }`,
      },
      entryPath: "Hero.tsx",
    });
    // Duplicate binding in one file is a parse error — also accept collision if parsed.
    expect(clash.ok).toBe(false);
  });

  it("errors when the same local binding name maps to two paths via nested imports", () => {
    const files = {
      "Hero.tsx": `import A from "./A";
import B from "./B";
export default function Hero() { return <><A /><B /></>; }`,
      "A.tsx": `import Button from "./components/Button";
export default function A() { return <Button />; }`,
      "B.tsx": `import Button from "./shared/Button";
export default function B() { return <Button />; }`,
      "components/Button.tsx": `export default function Button() { return <button>A</button>; }`,
      "shared/Button.tsx": `export default function Button() { return <button>B</button>; }`,
    };
    const graph = resolveImportGraph({ files, entryPath: "Hero.tsx" });
    expect(graph.ok).toBe(false);
    if (!graph.ok) {
      expect(
        graph.diagnostics.some((d) => d.code === "component-name-collision"),
      ).toBe(true);
    }
  });
});

describe("section-input Phase C: convertSource integration", () => {
  it("one-file folder matches convertSource single-file behavior", () => {
    const source = `export default function Solo() {
  return <h1 className="text-xl">Hello Solo</h1>;
}`;
    const single = convertSource({ source, language: "tsx", catalog });
    const folder = convertSectionInput({
      files: { "Solo.tsx": source },
      convert: { language: "tsx", catalog },
    });
    expect(folder.outcome).toBe(single.outcome);
    expect(canonicalizeElementorJson(folder.elementorJson as ElementorDocument)).toEqual(
      canonicalizeElementorJson(single.elementorJson as ElementorDocument),
    );
  });

  it("folder with one local component inlines via knownComponentSources", () => {
    const result = convertSectionInput({
      files: {
        "Hero.tsx": `import Content from "./Content";
export default function Hero() {
  return (
    <section className="flex flex-col">
      <Content />
    </section>
  );
}`,
        "Content.tsx": `export default function Content() {
  return <h2 className="text-lg">Nested Title</h2>;
}`,
      },
      entryPath: "Hero.tsx",
      convert: { language: "tsx", catalog, title: "Hero" },
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    assertValidDocument(result.elementorJson);
    const html = JSON.stringify(result.elementorJson);
    expect(html).toContain("Nested Title");
    expect(
      result.report.diagnostics.some((d) =>
        d.message.toLowerCase().includes("unknown"),
      ),
    ).toBe(false);
  });

  it("nested local components produce valid Elementor JSON", () => {
    const result = convertSectionInput({
      files: {
        "HeroSection/HeroSection.tsx": `import HeroContent from "./HeroContent";
export default function HeroSection() {
  return (
    <div className="p-8">
      <HeroContent />
    </div>
  );
}`,
        "HeroSection/HeroContent.tsx": `import Button from "./components/Button";
export default function HeroContent() {
  return (
    <div className="flex flex-col gap-2">
      <h1>Welcome</h1>
      <Button />
    </div>
  );
}`,
        "HeroSection/components/Button.tsx": `export default function Button() {
  return <a href="/go" className="bg-blue-600 text-white px-4 py-2">Get Started</a>;
}`,
      },
      sectionName: "HeroSection",
      convert: { language: "tsx", catalog },
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    assertValidDocument(result.elementorJson);
    const html = JSON.stringify(result.elementorJson);
    expect(html).toContain("Welcome");
    expect(html).toContain("Get Started");
  });

  it("documents that dynamic props are not substituted", () => {
    const result = convertSectionInput({
      files: {
        "Hero.tsx": `import Button from "./Button";
export default function Hero() {
  return <Button text={label} />;
}`,
        "Button.tsx": `export default function Button({ text }: { text: string }) {
  return <button>{text}</button>;
}`,
      },
      entryPath: "Hero.tsx",
      convert: { language: "tsx", catalog },
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    expect(
      result.report.diagnostics.some(
        (d) => d.code === "dynamic-prop" || d.message.includes("not a static"),
      ),
    ).toBe(true);
  });

  it("substitutes static literal props across folder imports", () => {
    const result = convertSectionInput({
      files: {
        "Hero.tsx": `import Button from "./Button";
export default function Hero() {
  return <Button text="Get Started" />;
}`,
        "Button.tsx": `export default function Button({ text }: { text: string }) {
  return <button>{text}</button>;
}`,
      },
      entryPath: "Hero.tsx",
      convert: { language: "tsx", catalog },
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    expect(JSON.stringify(result.elementorJson)).toContain("Get Started");
  });

  it("existing convertSource({ source }) path remains available and unchanged API-wise", () => {
    const result = convertSource({
      source: `export function X() { return <p>Keep me</p>; }`,
      language: "tsx",
      catalog,
    });
    expect(result.outcome).toBe("complete");
    assertValidDocument(result.elementorJson);
  });

  it("resolveSectionInput feeds convertSource options", () => {
    const resolved = resolveSectionInput({
      files: {
        "A.tsx": `import B from "./B";
export default function A() { return <B />; }`,
        "B.tsx": `export default function B() { return <span>Bee</span>; }`,
      },
      entryPath: "A.tsx",
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.convertOptions.source).toContain("function A");
    expect(resolved.convertOptions.knownComponentSources?.B).toContain(
      "function B",
    );
    const converted = convertSource({
      ...resolved.convertOptions,
      catalog,
    });
    assertValidDocument(converted.elementorJson);
    expect(JSON.stringify(converted.elementorJson)).toContain("Bee");
  });
});
