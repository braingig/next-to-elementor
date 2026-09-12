/**
 * Lucide stub must use static SVG attributes so existing icon / serialize path works.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeReactSource,
  convertSource,
  loadElementorFreeCatalog,
  type IrNode,
} from "@/lib/converter";
import { lucideReactAdapter } from "@/lib/converter/project/deps/adapters/lucide";

const catalog = loadElementorFreeCatalog("4.2.4");

function walk(node: IrNode, visit: (n: IrNode) => void) {
  visit(node);
  for (const c of node.children) walk(c, visit);
}

describe("lucide static SVG stub attributes", () => {
  it("generated stub has literal width/height and no dynamic className", () => {
    const applied = lucideReactAdapter.apply({
      packageName: "lucide-react",
      hits: [
        {
          specifier: "lucide-react",
          packageName: "lucide-react",
          fromPath: "app/page.tsx",
          localNames: ["Sparkles"],
          isNamespace: false,
          isDefault: false,
          isSideEffect: false,
        },
      ],
      moduleSources: {
        "app/page.tsx": `import { Sparkles } from "lucide-react"; export default function H(){ return <Sparkles /> }`,
      },
      entryFile: "app/page.tsx",
      entrySource: "",
    });
    const stub = applied.knownComponentSources?.Sparkles ?? "";
    expect(stub).toContain('data-icon="sparkles"');
    expect(stub).toContain('width="24"');
    expect(stub).toContain('height="24"');
    expect(stub).not.toMatch(/width=\{/);
    expect(stub).not.toMatch(/height=\{/);
    expect(stub).not.toContain("className={");
    expect(stub).not.toContain("const size");
  });

  it("stub source analyzes without svg-complex", () => {
    const applied = lucideReactAdapter.apply({
      packageName: "lucide-react",
      hits: [
        {
          specifier: "lucide-react",
          packageName: "lucide-react",
          fromPath: "x.tsx",
          localNames: ["Phone"],
          isNamespace: false,
          isDefault: false,
          isSideEffect: false,
        },
      ],
      moduleSources: {
        "x.tsx": `import { Phone } from "lucide-react"; export default function H(){ return <Phone /> }`,
      },
      entryFile: "x.tsx",
      entrySource: "",
    });
    const stub = applied.knownComponentSources!.Phone!;
    const { document } = analyzeReactSource(stub, {
      sourcePath: "Phone.tsx",
      componentName: "Phone",
    });
    expect(
      document.diagnostics.some((d) => d.code === "svg-complex"),
    ).toBe(false);
    let icons = 0;
    walk(document.root, (n) => {
      if (n.kind === "icon" && n.props.name === "phone") icons += 1;
    });
    expect(icons).toBe(1);
  });

  it("<Sparkles className> reaches icon path instead of svg-complex", () => {
    const applied = lucideReactAdapter.apply({
      packageName: "lucide-react",
      hits: [
        {
          specifier: "lucide-react",
          packageName: "lucide-react",
          fromPath: "hero.tsx",
          localNames: ["Sparkles"],
          isNamespace: false,
          isDefault: false,
          isSideEffect: false,
        },
      ],
      moduleSources: {
        "hero.tsx": `
          import { Sparkles } from "lucide-react";
          export default function Hero() {
            return <Sparkles className="h-4 w-4 twinkle" />;
          }
        `,
      },
      entryFile: "hero.tsx",
      entrySource: "",
    });

    const { document } = analyzeReactSource(
      `
        import { Sparkles } from "lucide-react";
        export default function Hero() {
          return <Sparkles className="h-4 w-4 twinkle" />;
        }
      `,
      {
        sourcePath: "hero.tsx",
        knownComponentSources: applied.knownComponentSources,
      },
    );

    expect(
      document.diagnostics.some((d) => d.code === "svg-complex"),
    ).toBe(false);

    let found: IrNode | undefined;
    walk(document.root, (n) => {
      if (n.kind === "icon" && n.props.name === "sparkles") found = n;
    });
    expect(found).toBeDefined();
    expect(found!.kind).toBe("icon");
    // Usage className merged onto inlined provenance (not stub expression).
    expect(found!.provenance?.classNames ?? []).toEqual(
      expect.arrayContaining(["h-4", "w-4", "twinkle"]),
    );
  });

  it("convertSource maps Sparkles to Free icon widget without svg-complex unsupported", () => {
    const applied = lucideReactAdapter.apply({
      packageName: "lucide-react",
      hits: [
        {
          specifier: "lucide-react",
          packageName: "lucide-react",
          fromPath: "page.tsx",
          localNames: ["Sparkles"],
          isNamespace: false,
          isDefault: false,
          isSideEffect: false,
        },
      ],
      moduleSources: {
        "page.tsx": `import { Sparkles } from "lucide-react"; export default function P(){ return <Sparkles className="h-4" /> }`,
      },
      entryFile: "page.tsx",
      entrySource: "",
    });

    const result = convertSource({
      source: `
        import { Sparkles } from "lucide-react";
        export default function Page() {
          return (
            <section>
              <Sparkles className="h-4 w-4 twinkle" />
            </section>
          );
        }
      `,
      language: "tsx",
      catalog,
      knownComponentSources: applied.knownComponentSources,
    });

    expect(
      result.report.nodes.some(
        (n) =>
          n.decision === "unsupported" && n.reasonCode === "svg-complex",
      ),
    ).toBe(false);
    expect(
      result.report.nodes.some(
        (n) => n.widgetType === "icon" || n.irKind === "icon",
      ),
    ).toBe(true);
  });
});
