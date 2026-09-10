import { describe, expect, it } from "vitest";
import {
  analyzeReactSource,
  convertSectionInput,
  loadElementorFreeCatalog,
  type IrNode,
} from "@/lib/converter";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

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

describe("Follow-up: JSX children prop binding", () => {
  it("1. binds text children to {children}", () => {
    const { document } = analyzeReactSource(
      `
function CTAButton({ children }: { children: React.ReactNode }) {
  return <a href="#x">{children}</a>;
}
export function App() {
  return <CTAButton>Get Started</CTAButton>;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Get Started");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("2. binds children with static attribute props", () => {
    const { document } = analyzeReactSource(
      `
function CTAButton({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href}>{children}</a>;
}
export function App() {
  return <CTAButton href="#features">Get Started</CTAButton>;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Get Started");
    let href: string | undefined;
    walk(document.root, (n) => {
      if (n.kind === "link" || n.kind === "button") {
        if (typeof n.props.href === "string") href = n.props.href;
      }
    });
    expect(href).toBe("#features");
  });

  it("3. binds nested element children when safe", () => {
    const { document } = analyzeReactSource(
      `
function Wrap({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
export function App() {
  return (
    <Wrap>
      <span>Static content</span>
    </Wrap>
  );
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("Static content");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("4. dynamic children remain honest", () => {
    const { document } = analyzeReactSource(
      `
function Wrap({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
export function App() {
  return <Wrap>{user.label}</Wrap>;
}
`,
      { language: "tsx" },
    );
    expect(
      unsupportedReasons(document.root).length > 0 ||
        document.diagnostics.some(
          (d) =>
            d.code === "dynamic-prop" ||
            d.message.includes("Identifier") ||
            d.message.includes("dynamic"),
        ),
    ).toBe(true);
    expect(texts(document.root)).not.toContain("user.label");
  });
});

describe("Follow-up: static object lookup + nullish fallback", () => {
  it("5. resolves static object lookup with literal key", () => {
    const { document } = analyzeReactSource(
      `
const icons = { bolt: "⚡" };
export function App() {
  return <span>{icons["bolt"]}</span>;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("⚡");
  });

  it("6. resolves computed lookup through Phase D prop scope", () => {
    const { document } = analyzeReactSource(
      `
const icons = { bolt: "⚡", shield: "🛡️" };
function FeatureIcon({ name }: { name: string }) {
  return <span>{icons[name]}</span>;
}
export function App() {
  return <FeatureIcon name="bolt" />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("⚡");
    expect(unsupportedReasons(document.root)).toEqual([]);
  });

  it("7. resolves nullish fallback when key hits", () => {
    const { document } = analyzeReactSource(
      `
const icons = { bolt: "⚡" };
function FeatureIcon({ name }: { name: string }) {
  return <span>{icons[name] ?? "•"}</span>;
}
export function App() {
  return <FeatureIcon name="bolt" />;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("⚡");
    expect(texts(document.root)).not.toContain("•");
  });

  it("8. unknown key uses nullish fallback", () => {
    const { document } = analyzeReactSource(
      `
const icons = { bolt: "⚡" };
export function App() {
  return <span>{icons["unknown"] ?? "•"}</span>;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).toContain("•");
  });

  it("9. dynamic key remains unsupported", () => {
    const { document } = analyzeReactSource(
      `
const icons = { bolt: "⚡" };
export function App() {
  return <span>{icons[userIcon] ?? "•"}</span>;
}
`,
      { language: "tsx" },
    );
    expect(texts(document.root)).not.toContain("⚡");
    expect(
      unsupportedReasons(document.root).length > 0 ||
        document.diagnostics.some((d) =>
          /dynamic|unsupported/i.test(d.message),
        ),
    ).toBe(true);
  });
});

describe("Follow-up: ProductSection real-world folder", () => {
  const FIXTURE = "/Users/nusratnova/Downloads/React_Elementor_Test_Section";

  function loadFiles(dir: string): { files: Record<string, string>; css: string } {
    const files: Record<string, string> = {};
    const cssParts: string[] = [];
    function walkDir(current: string) {
      for (const name of readdirSync(current)) {
        const abs = join(current, name);
        const rel = relative(dir, abs).replace(/\\/g, "/");
        if (statSync(abs).isDirectory()) {
          walkDir(abs);
          continue;
        }
        if (/\.(tsx|ts|jsx|js)$/i.test(name)) {
          files[rel] = readFileSync(abs, "utf8");
        } else if (/\.css$/i.test(name)) {
          cssParts.push(readFileSync(abs, "utf8"));
        }
      }
    }
    walkDir(dir);
    return { files, css: cssParts.join("\n\n") };
  }

  it("13. ProductSection: children + icon lookup errors cleared", () => {
    const { files, css } = loadFiles(FIXTURE);
    const result = convertSectionInput({
      files,
      entryPath: "ProductSection.tsx",
      convert: {
        language: "tsx",
        catalog,
        css,
        title: "ProductSection",
      },
    });
    expect(["complete", "partial"]).toContain(result.outcome);
    expect(result.report.summary.unsupportedCount).toBe(0);
    expect(result.report.summary.errorCount).toBe(0);

    const html = JSON.stringify(result.elementorJson);
    expect(html).toContain("Get Started");
    expect(html).toContain("#features");
    expect(html).toContain("Fast setup");
    expect(html).toContain("Reliable output");
    expect(html).toContain("Responsive design");
    expect(html).toContain("⚡");
    expect(html).toContain("🛡️");
    expect(html).toContain("✦");

    expect(
      result.report.diagnostics.some((d) =>
        d.message.includes("LogicalExpression"),
      ),
    ).toBe(false);
    expect(
      result.report.diagnostics.some(
        (d) =>
          d.severity === "error" && d.message.includes("Identifier"),
      ),
    ).toBe(false);

    // flex mapping intentionally untouched
    expect(
      result.report.diagnostics.filter((d) =>
        d.message.includes("CSS property not mapped into IrStyle: flex"),
      ).length,
    ).toBeGreaterThan(0);
  });
});
