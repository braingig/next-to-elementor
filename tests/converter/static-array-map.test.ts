import { describe, expect, it } from "vitest";
import {
  analyzeReactSource,
  convertSectionInput,
  loadElementorFreeCatalog,
  type IrNode,
} from "@/lib/converter";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const catalog = loadElementorFreeCatalog("4.2.4");

function walk(node: IrNode, visit: (n: IrNode) => void) {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

function texts(root: IrNode): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (
      (n.kind === "text" ||
        n.kind === "heading" ||
        n.kind === "button" ||
        n.kind === "link") &&
      typeof n.props.text === "string" &&
      n.props.text.length > 0
    ) {
      out.push(n.props.text);
    }
  });
  return out;
}

function unsupportedReasons(root: IrNode): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (n.kind === "unsupported") out.push(String(n.props.reasonCode));
  });
  return out;
}

describe("Phase E static Array.map() expansion", () => {
  it("1. expands static array map into three cards", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
const features = [
  { title: "Fast setup" },
  { title: "Reliable output" },
  { title: "Responsive design" },
];
export function App() {
  return (
    <div>
      {features.map((feature) => (
        <Card title={feature.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    const t = texts(document.root);
    expect(t).toContain("Fast setup");
    expect(t).toContain("Reliable output");
    expect(t).toContain("Responsive design");
    expect(unsupportedReasons(document.root)).toEqual([]);
    expect(
      document.diagnostics.some((d) => d.code === "static-array-map"),
    ).toBe(true);
  });

  it("2. passes static object properties as props", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title, description }: { title: string; description: string }) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
const items = [{ title: "A", description: "Alpha" }];
export function App() {
  return (
    <div>
      {items.map((item) => (
        <Card title={item.title} description={item.description} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toEqual(
      expect.arrayContaining(["A", "Alpha"]),
    );
  });

  it("3. expands string / number / boolean static values", () => {
    const { document } = analyzeReactSource(
      `
function Flag({ on }: { on: boolean }) {
  return on ? <span>yes</span> : <span>no</span>;
}
const rows = [
  { label: "hello", count: 3, on: true },
];
export function App() {
  return (
    <div>
      {rows.map((row) => (
        <div>
          <p>{row.label}</p>
          <p>{row.count}</p>
          <Flag on={row.on} />
        </div>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    const t = texts(document.root);
    expect(t).toContain("hello");
    expect(t).toContain("3");
    expect(t).toContain("yes");
    expect(t).not.toContain("no");
  });

  it("4. supports map with index parameter", () => {
    const { document } = analyzeReactSource(
      `
const labels = ["first", "second"];
export function App() {
  return (
    <div>
      {labels.map((label, index) => (
        <p>
          {index}:{label}
        </p>
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    const t = texts(document.root);
    expect(t.some((s) => s.includes("0") && s.includes("first"))).toBe(true);
    expect(t.some((s) => s.includes("1") && s.includes("second"))).toBe(true);
  });

  it("5. expands multiple independent map expressions", () => {
    const { document } = analyzeReactSource(
      `
const a = [{ title: "One" }];
const b = [{ title: "Two" }];
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
export function App() {
  return (
    <div>
      {a.map((x) => (
        <Card title={x.title} />
      ))}
      {b.map((x) => (
        <Card title={x.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toEqual(
      expect.arrayContaining(["One", "Two"]),
    );
  });

  it("6. nests local components inside mapped JSX", () => {
    const { document } = analyzeReactSource(
      `
function Inner({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
function Outer({ title }: { title: string }) {
  return <Inner title={title} />;
}
const items = [{ title: "Nested map" }];
export function App() {
  return (
    <div>
      {items.map((item) => (
        <Outer title={item.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Nested map");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("7. rejects function-returned / dynamic arrays", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
export function App() {
  const features = getFeatures();
  return (
    <div>
      {features.map((f) => (
        <Card title={f.title} />
      ))}
    </div>
  );
}
declare function getFeatures(): { title: string }[];
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
    expect(texts(document.root)).not.toContain("guessed");
  });

  it("8. rejects unresolved identifier receivers", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
export function App() {
  return (
    <div>
      {features.map((f) => (
        <Card title={f.title} />
      ))}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
  });

  it("9. does not execute map callbacks with unsupported body logic", () => {
    const { document } = analyzeReactSource(
      `
const items = [{ title: "X" }];
export function App() {
  return (
    <div>
      {items.map((item) => {
        const upper = item.title.toUpperCase();
        return <h3>{upper}</h3>;
      })}
    </div>
  );
}
`,
      { language: "tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
    expect(texts(document.root)).not.toContain("X");
  });
});

describe("Phase E RealWorldSection folder fixture", () => {
  const FIXTURE = join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/section-input/RealWorldSection",
  );

  function loadComponentFiles(dir: string): Record<string, string> {
    const files: Record<string, string> = {};
    function walkDir(current: string) {
      for (const name of readdirSync(current)) {
        const abs = join(current, name);
        const rel = relative(dir, abs).replace(/\\/g, "/");
        if (statSync(abs).isDirectory()) {
          walkDir(abs);
          continue;
        }
        if (/\.(tsx|ts|jsx|js|css)$/i.test(name)) {
          files[rel] = readFileSync(abs, "utf8");
        }
      }
    }
    walkDir(dir);
    return files;
  }

  it("12. expands FeatureCard map into Elementor JSON with distinct props", () => {
    const files = loadComponentFiles(FIXTURE);
    const result = convertSectionInput({
      files,
      sectionName: "RealWorldSection",
      convert: {
        language: "tsx",
        catalog,
        css: files["styles.css"] ?? "",
        title: "RealWorldSection",
      },
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    expect(result.elementorJson).not.toBeNull();
    expect(result.report.summary.unsupportedCount).toBe(0);
    expect(result.report.summary.errorCount).toBe(0);

    const html = JSON.stringify(result.elementorJson);
    expect(html).toContain("Fast setup");
    expect(html).toContain("Reliable output");
    expect(html).toContain("Responsive design");
    expect(html).toContain("Start converting");
    expect(html).toContain("Ship landing sections");
    expect(html).toContain("fas fa-bolt");
    expect(html).toContain("/start");
  });
});
