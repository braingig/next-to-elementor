/**
 * Unknown-component children passthrough — generic container + convertChildren.
 * Does not emulate Radix/runtime behavior.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeReactSource,
  convertSource,
  loadElementorFreeCatalog,
  type IrNode,
} from "@/lib/converter";
import { MAX_UNKNOWN_PASSTHROUGH_DEPTH } from "@/lib/converter/parse/analyze/jsx";

const catalog = loadElementorFreeCatalog("4.2.4");

function walk(node: IrNode, visit: (n: IrNode) => void) {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

function collectTexts(root: IrNode): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (
      (n.kind === "text" || n.kind === "heading") &&
      typeof n.props.text === "string" &&
      n.props.text.length > 0
    ) {
      out.push(n.props.text);
    }
  });
  return out;
}

function collectNotes(root: IrNode): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    for (const note of n.notes ?? []) out.push(note);
  });
  return out;
}

function countKind(root: IrNode, kind: string): number {
  let n = 0;
  walk(root, (node) => {
    if (node.kind === kind) n += 1;
  });
  return n;
}

function unsupportedReasons(root: IrNode): string[] {
  const out: string[] = [];
  walk(root, (n) => {
    if (n.kind === "unsupported") out.push(String(n.props.reasonCode));
  });
  return out;
}

describe("unknown-component children passthrough", () => {
  it("1. unknown with static JSX child → container + heading", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page() {
        return (
          <Unknown className="wrap">
            <h2>Hi</h2>
          </Unknown>
        );
      }
      `,
      { sourcePath: "passthrough-1.tsx" },
    );
    expect(collectTexts(document.root)).toContain("Hi");
    expect(countKind(document.root, "heading")).toBeGreaterThanOrEqual(1);
    expect(countKind(document.root, "unsupported")).toBe(0);
    expect(
      document.diagnostics.some((d) => d.code === "unknown-component-passthrough"),
    ).toBe(true);
    expect(
      collectNotes(document.root).some((n) =>
        n.startsWith("unknown-component-passthrough:"),
      ),
    ).toBe(true);
  });

  it("2. unknown with multiple children", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page() {
        return (
          <Unknown>
            <h2>One</h2>
            <p>Two</p>
          </Unknown>
        );
      }
      `,
      { sourcePath: "passthrough-2.tsx" },
    );
    const texts = collectTexts(document.root);
    expect(texts).toEqual(expect.arrayContaining(["One", "Two"]));
  });

  it("3. unknown with fragment children", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page() {
        return (
          <Unknown>
            <>
              <h2>Frag A</h2>
              <p>Frag B</p>
            </>
          </Unknown>
        );
      }
      `,
      { sourcePath: "passthrough-3.tsx" },
    );
    expect(collectTexts(document.root)).toEqual(
      expect.arrayContaining(["Frag A", "Frag B"]),
    );
  });

  it("4. nested unknown components", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page() {
        return (
          <UnknownA>
            <UnknownB>
              <h2>Nested</h2>
            </UnknownB>
          </UnknownA>
        );
      }
      `,
      { sourcePath: "passthrough-4.tsx" },
    );
    expect(collectTexts(document.root)).toContain("Nested");
    expect(
      collectNotes(document.root).filter((n) =>
        n.startsWith("unknown-component-passthrough:"),
      ).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("5. unknown with static .map() children (FAQ-like)", () => {
    const { document } = analyzeReactSource(
      `
      const FAQS = [
        { q: "Q1", a: "A1" },
        { q: "Q2", a: "A2" },
        { q: "Q3", a: "A3" },
      ];
      export default function Page() {
        return (
          <Accordion type="single" className="mt-10">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={"item-" + i}>
                <AccordionTrigger>{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        );
      }
      `,
      { sourcePath: "passthrough-5.tsx" },
    );
    const texts = collectTexts(document.root);
    expect(texts).toEqual(
      expect.arrayContaining(["Q1", "A1", "Q2", "A2", "Q3", "A3"]),
    );
    expect(unsupportedReasons(document.root)).not.toContain("unknown-component");
  });

  it("6. unknown with text children", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page() {
        return <Unknown>Plain text here</Unknown>;
      }
      `,
      { sourcePath: "passthrough-6.tsx" },
    );
    expect(collectTexts(document.root).join(" ")).toMatch(/Plain text here/);
  });

  it("7. self-closing unknown remains unsupported leaf", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page() {
        return (
          <section>
            <FancyWidget title="x" />
          </section>
        );
      }
      `,
      { sourcePath: "passthrough-7.tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("unknown-component");
    expect(
      collectNotes(document.root).some((n) =>
        n.startsWith("unknown-component-passthrough:"),
      ),
    ).toBe(false);
  });

  it("8. successfully inlined local component unchanged (no passthrough)", () => {
    const { document } = analyzeReactSource(
      `
      function Card({ title }: { title: string }) {
        return <h2>{title}</h2>;
      }
      export default function Page() {
        return <Card title="Inlined" />;
      }
      `,
      { sourcePath: "passthrough-8.tsx" },
    );
    expect(collectTexts(document.root)).toContain("Inlined");
    expect(
      document.diagnostics.some((d) => d.code === "inlined-local-component"),
    ).toBe(true);
    expect(
      document.diagnostics.some((d) => d.code === "unknown-component-passthrough"),
    ).toBe(false);
  });

  it("9. dynamic child inside unknown remains dynamic", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page({ open }: { open: boolean }) {
        return (
          <Unknown>
            {open && <h2>Secret</h2>}
          </Unknown>
        );
      }
      `,
      { sourcePath: "passthrough-9.tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("dynamic-content");
    expect(collectTexts(document.root)).not.toContain("Secret");
  });

  it("10. event/runtime-shaped child stays unsupported/dynamic", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page() {
        return (
          <Unknown>
            {items.map((x) => <h2 key={x}>{x}</h2>)}
          </Unknown>
        );
      }
      `,
      { sourcePath: "passthrough-10.tsx" },
    );
    // items is not a static array → dynamic-children
    expect(unsupportedReasons(document.root)).toContain("dynamic-children");
  });

  it("11. no duplicate children from passthrough", () => {
    const { document } = analyzeReactSource(
      `
      export default function Page() {
        return (
          <Unknown>
            <h2>OnlyOnce</h2>
          </Unknown>
        );
      }
      `,
      { sourcePath: "passthrough-11.tsx" },
    );
    expect(collectTexts(document.root).filter((t) => t === "OnlyOnce")).toHaveLength(
      1,
    );
  });

  it("12. passthrough depth guard refuses runaway nesting", () => {
    let nested = "<h2>Deep</h2>";
    for (let i = 0; i < MAX_UNKNOWN_PASSTHROUGH_DEPTH + 2; i += 1) {
      nested = `<U${i}>${nested}</U${i}>`;
    }
    const { document } = analyzeReactSource(
      `export default function Page() { return (${nested}); }`,
      { sourcePath: "passthrough-12.tsx" },
    );
    expect(unsupportedReasons(document.root)).toContain("unknown-component");
    // Depth exceeded somewhere — Deep may or may not appear depending on cut point
    expect(
      document.diagnostics.some((d) => /depth exceeded/i.test(d.message)),
    ).toBe(true);
  });

  it("13. end-to-end convertSource still maps unknown self-closing", () => {
    const result = convertSource({
      source: `
        export function UnknownThing() {
          return (
            <div>
              <FancyWidget title="x" />
            </div>
          );
        }
      `,
      language: "tsx",
      catalog,
    });
    expect(
      result.report.nodes.some(
        (n) =>
          n.decision === "unsupported" &&
          n.reasonCode === "unknown-component",
      ),
    ).toBe(true);
  });

  it("14. FAQ-like end-to-end recovers Q/A via convertSource", () => {
    const result = convertSource({
      source: `
        const FAQS = [
          { q: "What areas?", a: "West Virginia." },
          { q: "Do you remove?", a: "Yes we remove." },
        ];
        export default function Faq() {
          return (
            <section>
              <Accordion>
                {FAQS.map((f) => (
                  <AccordionItem key={f.q}>
                    <AccordionTrigger>{f.q}</AccordionTrigger>
                    <AccordionContent>{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </section>
          );
        }
      `,
      language: "tsx",
      catalog,
    });
    const blob = JSON.stringify(result.elementorJson);
    expect(blob).toContain("What areas?");
    expect(blob).toContain("West Virginia.");
    expect(blob).toContain("Do you remove?");
    expect(blob).toContain("Yes we remove.");
    expect(
      result.report.nodes.filter(
        (n) =>
          n.decision === "unsupported" &&
          n.reasonCode === "unknown-component",
      ),
    ).toHaveLength(0);
  });
});
