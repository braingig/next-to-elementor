import { describe, expect, it } from "vitest";
import {
  analyzeReactSource,
  convertSectionInput,
  convertSource,
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

describe("Phase D static prop substitution", () => {
  it("1. substitutes string prop on Button", () => {
    const { document } = analyzeReactSource(
      `
function Button({ text }: { text: string }) {
  return <button>{text}</button>;
}
export function App() {
  return <Button text="Get Started" />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Get Started");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("2. substitutes multiple string props on Card", () => {
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
export function App() {
  return <Card title="Fast" description="Quick setup" />;
}
`,
      { language: "tsx" },
    );
    const t = texts(document.root);
    expect(t).toContain("Fast");
    expect(t).toContain("Quick setup");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("3. substitutes number prop", () => {
    const { document } = analyzeReactSource(
      `
function Card({ count }: { count: number }) {
  return <p>{count}</p>;
}
export function App() {
  return <Card count={3} />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("3");
  });

  it("4. substitutes boolean prop into static conditional", () => {
    const { document } = analyzeReactSource(
      `
function Badge({ enabled }: { enabled: boolean }) {
  return enabled ? <span>On</span> : <span>Off</span>;
}
export function App() {
  return <Badge enabled={true} />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("On");
    expect(texts(document.root)).not.toContain("Off");
  });

  it("5. supports destructured props", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h2>{title}</h2>;
}
export default function Page() {
  return <Card title="Destructured" />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Destructured");
  });

  it("6. supports simple props object access", () => {
    const { document } = analyzeReactSource(
      `
function Card(props: { title: string }) {
  return <h3>{props.title}</h3>;
}
export function App() {
  return <Card title="Via props object" />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Via props object");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("7. passes static props through nested local components", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
function FeatureCard({ title }: { title: string }) {
  return <Card title={title} />;
}
export function App() {
  return <FeatureCard title="Nested Fast" />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Nested Fast");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("8. substitutes static props on imported knownComponentSources", () => {
    const result = convertSource({
      source: `
import FeatureCard from "./FeatureCard";
export default function App() {
  return <FeatureCard title="Imported Title" description="Imported Body" />;
}
`,
      language: "tsx",
      knownComponentSources: {
        FeatureCard: `
export default function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <article>
      <h3>{title}</h3>
      <p>{description}</p>
    </article>
  );
}
`,
      },
      catalog,
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    const html = JSON.stringify(result.elementorJson);
    expect(html).toContain("Imported Title");
    expect(html).toContain("Imported Body");
    expect(
      result.report.diagnostics.some((d) => d.code === "unknown-component"),
    ).toBe(false);
  });

  it("9. does not resolve dynamic props", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
export function App() {
  return <Card title={user.name} />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).not.toContain("user.name");
    expect(
      document.diagnostics.some(
        (d) => d.code === "dynamic-prop" || d.message.includes("not a static"),
      ),
    ).toBe(true);
    // Unbound {title} remains unsupported Identifier
    expect(unsupportedReasons(document.root).length).toBeGreaterThan(0);
  });

  it("10. spread props remain unsupported / unbound", () => {
    const { document } = analyzeReactSource(
      `
function Card({ title }: { title: string }) {
  return <h3>{title}</h3>;
}
export function App() {
  return <Card {...data} />;
}
`,
      { language: "tsx" },
    );
    expect(
      document.diagnostics.some((d) => d.message.toLowerCase().includes("spread")),
    ).toBe(true);
    expect(texts(document.root)).not.toContain("secret");
  });
});

describe("Phase D RealWorldSectionStatic fixture", () => {
  const FIXTURE = join(
    dirname(fileURLToPath(import.meta.url)),
    "fixtures/section-input/RealWorldSectionStatic",
  );

  function loadComponentFiles(dir: string): Record<string, string> {
    const files: Record<string, string> = {};
    function walk(current: string) {
      for (const name of readdirSync(current)) {
        const abs = join(current, name);
        const rel = relative(dir, abs).replace(/\\/g, "/");
        if (statSync(abs).isDirectory()) {
          walk(abs);
          continue;
        }
        if (/\.(tsx|ts|jsx|js|css)$/i.test(name)) {
          files[rel] = readFileSync(abs, "utf8");
        }
      }
    }
    walk(dir);
    return files;
  }

  it("13. FeatureCard literal props appear in Elementor JSON", () => {
    const files = loadComponentFiles(FIXTURE);
    const result = convertSectionInput({
      files,
      sectionName: "RealWorldSectionStatic",
      convert: { language: "tsx", catalog, title: "RealWorldSectionStatic" },
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
    expect(html).toContain("fas fa-bolt");
    // CTAButton static href
    expect(html).toContain("/start");
  });
});
