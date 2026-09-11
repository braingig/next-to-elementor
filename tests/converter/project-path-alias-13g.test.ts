/**
 * Phase 13g — project path-alias resolution for the conversion import graph.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeProjectStructure,
  buildConversionUnit,
  convertProject,
  createProjectVirtualFSFromTextFiles,
  extractProjectZip,
  matchPathAlias,
  normalizeAliasMappedPath,
  resolveImportGraph,
} from "@/lib/converter";
import { strToU8, zipSync } from "fflate";

function vfs(files: Record<string, string>) {
  return createProjectVirtualFSFromTextFiles(files);
}

const ALIAS_AT = { "@/*": ["./src/*"] } as const;

describe("Phase 13g: path alias resolution", () => {
  it("A. resolves @/ alias into knownComponentSources without external-import-skipped", () => {
    const files = {
      "package.json": JSON.stringify({
        dependencies: { react: "18.0.0" },
        devDependencies: { vite: "5.0.0" },
      }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { paths: { "@/*": ["./src/*"] } },
      }),
      "vite.config.ts": "export default {}",
      "src/main.tsx": `
        import Header from "@/components/site/header";
        export default function App() {
          return (
            <div>
              <Header />
            </div>
          );
        }
      `,
      "src/components/site/header.tsx": `
        export default function Header() {
          return <header><h1>Site Header</h1></header>;
        }
      `,
    };

    const analysis = analyzeProjectStructure(vfs(files));
    expect(analysis.manifest.pathAliases["@/*"]).toEqual(["./src/*"]);

    const route = analysis.routes.find((r) => r.path === "/") ?? analysis.routes[0];
    expect(route).toBeTruthy();

    const unit = buildConversionUnit(vfs(files), route!, {
      framework: analysis.manifest.framework,
      pathAliases: analysis.manifest.pathAliases,
    });

    expect(unit.graph.nodes).toContain("src/components/site/header.tsx");
    expect(unit.knownComponentSources.Header).toContain("Site Header");
    expect(
      unit.diagnostics.some(
        (d) =>
          d.code === "external-import-skipped" &&
          d.message.includes("@/components/site/header"),
      ),
    ).toBe(false);
    expect(
      unit.diagnostics.some((d) => d.code === "alias-resolved"),
    ).toBe(true);

    const result = convertProject(vfs(files));
    const summary = result.routes[0]?.conversion.report.summary;
    expect(summary?.unsupportedCount ?? 99).toBeLessThan(1);
    expect((summary?.nativeCount ?? 0) + (summary?.customCount ?? 0)).toBeGreaterThan(
      0,
    );
  });

  it("B. Festive-like: multiple aliased site components enter the graph", () => {
    const files = {
      "package.json": JSON.stringify({
        dependencies: {
          react: "18.0.0",
          "@tanstack/react-router": "1.0.0",
        },
        devDependencies: { vite: "5.0.0" },
      }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { paths: { "@/*": ["./src/*"] } },
      }),
      "src/routes/index.tsx": `
        import { createFileRoute } from "@tanstack/react-router";
        import { Header } from "@/components/site/header";
        import { Hero } from "@/components/site/hero";
        import { Footer } from "@/components/site/footer";
        export const Route = createFileRoute("/")({ component: Index });
        function Index() {
          return (
            <div>
              <Header />
              <main><Hero /></main>
              <Footer />
            </div>
          );
        }
      `,
      "src/components/site/header.tsx":
        "export function Header(){return <header>H</header>;}",
      "src/components/site/hero.tsx":
        "export function Hero(){return <section><h1>Hero</h1></section>;}",
      "src/components/site/footer.tsx":
        "export function Footer(){return <footer>F</footer>;}",
    };

    const result = convertProject(vfs(files));
    const unit = result.routes[0]?.unit;
    expect(unit?.graph.nodes.sort()).toEqual(
      [
        "src/components/site/footer.tsx",
        "src/components/site/header.tsx",
        "src/components/site/hero.tsx",
        "src/routes/index.tsx",
      ].sort(),
    );
    expect(Object.keys(unit?.knownComponentSources ?? {}).sort()).toEqual([
      "Footer",
      "Header",
      "Hero",
    ]);
    expect(
      unit?.diagnostics.some(
        (d) =>
          d.code === "external-import-skipped" &&
          d.message.includes("@/components/site/"),
      ),
    ).toBe(false);
    // npm package still skipped
    expect(
      unit?.diagnostics.some(
        (d) =>
          d.code === "external-import-skipped" &&
          d.message.includes("@tanstack/react-router"),
      ),
    ).toBe(true);

    const summary = result.routes[0]?.conversion.report.summary;
    expect(summary?.totalNodes ?? 0).toBeGreaterThan(5);
    expect(summary?.unsupportedCount ?? 99).toBeLessThan(3);
  });

  it("C. prefers the most specific alias among multiple patterns", () => {
    const graph = resolveImportGraph({
      files: {
        "src/routes/page.tsx": `
          import { Button } from "@components/ui/button";
          import { util } from "@/lib/util";
          export default function Page(){ return <Button />; }
        `,
        "src/components/ui/button.tsx":
          "export function Button(){return <button>ok</button>;}",
        "src/lib/util.ts": "export const util = 1;",
      },
      entryPath: "src/routes/page.tsx",
      pathAliases: {
        "@/*": ["./src/*"],
        "@components/*": ["./src/components/*"],
      },
    });
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(graph.graph.nodes).toContain("src/components/ui/button.tsx");
    expect(graph.graph.nodes).toContain("src/lib/util.ts");
    const buttonEdge = graph.graph.edges.find((e) =>
      e.specifier.includes("@components/"),
    );
    expect(buttonEdge?.to).toBe("src/components/ui/button.tsx");
    const match = matchPathAlias("@components/ui/button", {
      "@/*": ["./src/*"],
      "@components/*": ["./src/components/*"],
    });
    expect(match?.pattern).toBe("@components/*");
  });

  it("D. resolves alias without extension via existing .tsx / index conventions", () => {
    const withExt = resolveImportGraph({
      files: {
        "src/app.tsx": `import H from "@/components/site/header"; export default function A(){return <H/>;}`,
        "src/components/site/header.tsx":
          "export default function Header(){return <h1/>;}",
      },
      entryPath: "src/app.tsx",
      pathAliases: ALIAS_AT,
    });
    expect(withExt.ok).toBe(true);
    if (withExt.ok) {
      expect(withExt.graph.nodes).toContain("src/components/site/header.tsx");
    }

    const withIndex = resolveImportGraph({
      files: {
        "src/app.tsx": `import { Box } from "@/components/box"; export default function A(){return <Box/>;}`,
        "src/components/box/index.tsx":
          "export function Box(){return <div/>;}",
      },
      entryPath: "src/app.tsx",
      pathAliases: ALIAS_AT,
    });
    expect(withIndex.ok).toBe(true);
    if (withIndex.ok) {
      expect(withIndex.graph.nodes).toContain("src/components/box/index.tsx");
      expect(withIndex.knownComponentSources.Box).toBeTruthy();
    }
  });

  it("E. unresolved alias yields alias-unresolved and does not crash conversion", () => {
    const files = {
      "package.json": JSON.stringify({
        dependencies: { react: "18.0.0" },
        devDependencies: { vite: "5.0.0" },
      }),
      "tsconfig.json": JSON.stringify({
        compilerOptions: { paths: { "@/*": ["./src/*"] } },
      }),
      "src/main.tsx": `
        import Missing from "@/components/does-not-exist";
        export default function App(){ return <div><Missing /></div>; }
      `,
    };
    const result = convertProject(vfs(files));
    expect(result.outcome).not.toBe("failed");
    const unit = result.routes[0]?.unit;
    expect(
      unit?.diagnostics.some((d) => d.code === "alias-unresolved"),
    ).toBe(true);
    expect(unit?.graph.nodes).toEqual(["src/main.tsx"]);
    expect(result.routes[0]?.conversion.report.summary.totalNodes).toBeGreaterThan(
      0,
    );
  });

  it("F. rejects unsafe alias mappings (traversal / absolute / host paths)", () => {
    expect(normalizeAliasMappedPath("./src/../../etc/passwd")).toBeNull();
    expect(normalizeAliasMappedPath("/etc/passwd")).toBeNull();
    expect(normalizeAliasMappedPath("C:/Windows/system32")).toBeNull();
    expect(normalizeAliasMappedPath("file:///tmp/x")).toBeNull();

    const escape = resolveImportGraph({
      files: {
        "src/app.tsx": `import X from "@/../../secret"; export default function A(){return <X/>;}`,
        "secret.tsx": "export default function Secret(){return null;}",
      },
      entryPath: "src/app.tsx",
      pathAliases: { "@/*": ["./src/*"] },
    });
    expect(escape.ok).toBe(true);
    if (escape.ok) {
      expect(escape.graph.nodes).not.toContain("secret.tsx");
      expect(
        escape.diagnostics.some((d) => d.code === "alias-unresolved"),
      ).toBe(true);
    }

    // Real npm scoped package must NOT match "@/*"
    expect(
      matchPathAlias("@radix-ui/react-accordion", ALIAS_AT),
    ).toBeNull();
    expect(matchPathAlias("react", ALIAS_AT)).toBeNull();
  });

  it("G. classic relative imports remain unchanged when aliases are present", () => {
    const graph = resolveImportGraph({
      files: {
        "src/main.tsx": `
          import App from "./App";
          export default function Main(){ return <App />; }
        `,
        "src/App.tsx": "export default function App(){return <div/>;}",
      },
      entryPath: "src/main.tsx",
      pathAliases: ALIAS_AT,
    });
    expect(graph.ok).toBe(true);
    if (!graph.ok) return;
    expect(graph.graph.nodes.sort()).toEqual(["src/App.tsx", "src/main.tsx"]);
    expect(graph.knownComponentSources.App).toBeTruthy();
  });

  it("keeps distinct files with the same export name distinct (collision still errors)", () => {
    const clash = resolveImportGraph({
      files: {
        "src/page.tsx": `
          import { Card } from "@/components/a";
          import { Card as CardB } from "@/components/b";
          export default function P(){ return <><Card /><CardB /></>; }
        `,
        "src/components/a.tsx": "export function Card(){return <div>a</div>;}",
        "src/components/b.tsx": "export function Card(){return <div>b</div>;}",
      },
      entryPath: "src/page.tsx",
      pathAliases: ALIAS_AT,
    });
    expect(clash.ok).toBe(true);
    if (clash.ok) {
      expect(clash.bindingPaths.Card).toBe("src/components/a.tsx");
      expect(clash.bindingPaths.CardB).toBe("src/components/b.tsx");
    }

    // Nested imports binding the same local name to two different files.
    const collision = resolveImportGraph({
      files: {
        "src/page.tsx": `
          import A from "@/components/a-wrap";
          import B from "@/components/b-wrap";
          export default function P(){ return <><A /><B /></>; }
        `,
        "src/components/a-wrap.tsx": `
          import Button from "@/components/button-a";
          export default function A(){ return <Button />; }
        `,
        "src/components/b-wrap.tsx": `
          import Button from "@/components/button-b";
          export default function B(){ return <Button />; }
        `,
        "src/components/button-a.tsx":
          "export default function Button(){return <button>A</button>;}",
        "src/components/button-b.tsx":
          "export default function Button(){return <button>B</button>;}",
      },
      entryPath: "src/page.tsx",
      pathAliases: ALIAS_AT,
    });
    expect(collision.ok).toBe(false);
    expect(
      collision.diagnostics.some((d) => d.code === "component-name-collision"),
    ).toBe(true);
  });

  it("works end-to-end through ZIP extract → convertProject", () => {
    const zip = zipSync({
      "package.json": strToU8(
        JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
      ),
      "tsconfig.json": strToU8(
        JSON.stringify({
          compilerOptions: { paths: { "@/*": ["./src/*"] } },
        }),
      ),
      "src/main.tsx": strToU8(`
        import { Hero } from "@/components/hero";
        export default function App(){ return <Hero />; }
      `),
      "src/components/hero.tsx": strToU8(
        "export function Hero(){return <h1>Hello ZIP</h1>;}",
      ),
    });
    const extracted = extractProjectZip(zip);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const result = convertProject(extracted.vfs);
    expect(result.routes[0]?.unit?.graph.nodes).toContain(
      "src/components/hero.tsx",
    );
    expect(
      result.routes[0]?.conversion.report.summary.message,
    ).toMatch(/native/);
  });
});
