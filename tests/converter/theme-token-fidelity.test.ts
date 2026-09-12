/**
 * Root CSS discovery + static theme token fidelity.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  analyzeProjectStructure,
  buildConversionUnit,
  collectRouteScopedCss,
  createProjectVirtualFSFromTextFiles,
  extractThemeTokens,
  listRootCssSourceModules,
  oklchToCssColor,
  parseCssSources,
  resolveStyles,
  resolveTailwindUtility,
  stripCssImportQuery,
  type IrDocument,
} from "@/lib/converter";

function vfs(files: Record<string, string>) {
  return createProjectVirtualFSFromTextFiles(files);
}

function docWithClasses(classNames: string[]): IrDocument {
  return {
    version: "0.2.0",
    meta: { sourceLanguage: "tsx", sourceName: "theme-test" },
    root: {
      id: "root",
      kind: "container",
      status: "ok",
      props: { as: "div" },
      style: {},
      provenance: {
        htmlTag: "div",
        classNames,
        attributes: {},
      },
      notes: [],
      children: [],
    },
    diagnostics: [],
  };
}

const FESTIVE_THEME_CSS = `
@theme inline {
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-gold: var(--gold);
  --color-evergreen-foreground: var(--evergreen-foreground);
  --color-muted-foreground: var(--muted-foreground);
  --font-sans: "Outfit", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Fraunces", ui-serif, Georgia, serif;
}

:root {
  --primary: oklch(0.54 0.21 27);
  --primary-foreground: oklch(0.99 0.005 95);
  --gold: oklch(0.72 0.14 78);
  --evergreen-foreground: oklch(0.97 0.01 95);
  --muted-foreground: oklch(0.5 0.025 160);
}

@utility text-display {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: -0.015em;
}
`;

describe("stripCssImportQuery", () => {
  it("strips bundler query suffixes from CSS import specifiers", () => {
    expect(stripCssImportQuery("../styles.css?url")).toBe("../styles.css");
    expect(stripCssImportQuery("./app.css?inline")).toBe("./app.css");
    expect(stripCssImportQuery("./theme.css")).toBe("./theme.css");
  });
});

describe("root CSS discovery", () => {
  it("collects styles.css imported as ?url from a module", () => {
    const textFiles = {
      "src/routes/__root.tsx": `import appCss from "../styles.css?url";\nexport const x = appCss;\n`,
      "src/styles.css": ":root { --primary: oklch(0.54 0.21 27); }",
    };
    const result = collectRouteScopedCss({
      modulePaths: ["src/routes/__root.tsx"],
      moduleSources: {
        "src/routes/__root.tsx": textFiles["src/routes/__root.tsx"]!,
      },
      textFiles,
    });
    expect(result.cssPaths).toEqual(["src/styles.css"]);
    expect(result.css[0]).toContain("--primary");
    expect(
      result.diagnostics.some((d) => d.code === "css-import-query-stripped"),
    ).toBe(true);
  });

  it("includes TanStack __root CSS on a visual route unit", () => {
    const projectVfs = vfs({
      "package.json": JSON.stringify({
        dependencies: {
          react: "19.0.0",
          "@tanstack/react-router": "1.0.0",
        },
        devDependencies: { vite: "6.0.0" },
      }),
      "src/routes/__root.tsx": `
        import appCss from "../styles.css?url";
        import { createRootRoute } from "@tanstack/react-router";
        export const Route = createRootRoute({ component: () => null });
      `,
      "src/routes/index.tsx": `
        import { createFileRoute } from "@tanstack/react-router";
        function Index() {
          return <main className="bg-primary text-gold">Home</main>;
        }
        export const Route = createFileRoute("/")({ component: Index });
      `,
      "src/styles.css": FESTIVE_THEME_CSS,
    });

    expect(listRootCssSourceModules(Object.fromEntries(
      Object.entries(projectVfs.files)
        .filter(([, f]) => f.kind === "text")
        .map(([p, f]) => [p, (f as { content: string }).content]),
    ))).toEqual(["src/routes/__root.tsx"]);

    const analysis = analyzeProjectStructure(projectVfs);
    const home = analysis.routes.find((r) => r.path === "/")!;
    const unit = buildConversionUnit(projectVfs, home, {
      framework: analysis.manifest.framework,
    });

    expect(unit.cssPaths).toEqual(["src/styles.css"]);
    expect(
      unit.diagnostics.some((d) => d.code === "root-css-included"),
    ).toBe(true);
    expect(
      unit.diagnostics.some((d) => d.code === "css-import-query-stripped"),
    ).toBe(true);
  });

  it("still does not pull unused global CSS unrelated to root imports", () => {
    const projectVfs = vfs({
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/page.tsx": `
        import './home.css';
        export default function Home(){ return <h1 className="home">Home</h1>; }
      `,
      "app/home.css": ".home { color: red; }",
      "styles/global-unused.css": "body { margin: 0; }",
    });
    const analysis = analyzeProjectStructure(projectVfs);
    const home = analysis.routes.find((r) => r.path === "/")!;
    const unit = buildConversionUnit(projectVfs, home, {
      framework: analysis.manifest.framework,
    });
    expect(unit.cssPaths).toEqual(["app/home.css"]);
    expect(unit.cssPaths).not.toContain("styles/global-unused.css");
  });
});

describe("theme token extraction + resolveStyles", () => {
  it("converts oklch brand tokens to Free-friendly colors", () => {
    expect(oklchToCssColor("oklch(0.54 0.21 27)")).toBe("#cd171e");
  });

  it("extracts @theme colors and fonts from custom properties", () => {
    const parsed = parseCssSources([FESTIVE_THEME_CSS]);
    expect(parsed.customProperties["--color-primary"]).toBe("var(--primary)");
    expect(parsed.customProperties["--primary"]).toBe("oklch(0.54 0.21 27)");
    expect(parsed.customProperties["--font-display"]).toContain("Fraunces");

    const theme = extractThemeTokens(parsed.customProperties);
    expect(theme.colors.primary).toBe("#cd171e");
    expect(theme.colors.gold).toMatch(/^#/);
    expect(theme.fonts.sans).toBe("Outfit");
    expect(theme.fonts.display).toBe("Fraunces");

    expect(
      parsed.rules.some((r) => r.selectors[0] === ".text-display"),
    ).toBe(true);
  });

  it("resolves bg-primary / text-gold / font-sans via theme tokens", () => {
    const { document } = resolveStyles(
      docWithClasses([
        "bg-primary",
        "text-gold",
        "font-sans",
        "border-gold/40",
        "bg-primary/90",
      ]),
      { css: FESTIVE_THEME_CSS, resolveInline: false },
    );

    expect(document.root.style?.background?.color).toMatch(/^rgba\(205, 23, 30,/);
    expect(document.root.style?.typography?.color).toMatch(/^#/);
    expect(document.root.style?.typography?.fontFamily).toBe("Outfit");
    expect(document.root.style?.border?.color).toMatch(/^rgba\(/);

    expect(
      document.diagnostics.some(
        (d) =>
          d.code === "unknown-tailwind-class" &&
          d.message.includes("bg-primary"),
      ),
    ).toBe(false);
  });

  it("applies @utility text-display typography from root CSS", () => {
    const { document } = resolveStyles(docWithClasses(["text-display"]), {
      css: FESTIVE_THEME_CSS,
      resolveInline: false,
    });
    expect(document.root.style?.typography?.fontFamily).toBe("Fraunces");
    expect(document.root.style?.typography?.fontWeight).toBe("700");
    expect(document.root.style?.typography?.letterSpacing).toBe("-0.015em");
    expect(
      document.diagnostics.some(
        (d) =>
          d.code === "unknown-tailwind-class" &&
          d.message.includes("text-display"),
      ),
    ).toBe(false);
  });

  it("does not invent colors for unknown theme tokens", () => {
    expect(
      resolveTailwindUtility("bg-not-a-real-token", {
        colors: { primary: "#cd171e" },
        fonts: {},
      }),
    ).toBeNull();
  });
});

describe("Festive styles.css fixture (when present)", () => {
  it("extracts real Festive theme tokens from disk styles.css", () => {
    const path =
      "/Users/nusratnova/Downloads/Festive Lights Pro/src/styles.css";
    let css: string;
    try {
      css = readFileSync(path, "utf8");
    } catch {
      return;
    }
    const parsed = parseCssSources([css]);
    const theme = extractThemeTokens(parsed.customProperties);
    expect(theme.colors.primary).toBe("#cd171e");
    expect(theme.colors.gold).toBeTruthy();
    expect(theme.fonts.sans).toBe("Outfit");
    expect(theme.fonts.display).toBe("Fraunces");
    expect(
      parsed.rules.some((r) => r.selectors[0] === ".text-display"),
    ).toBe(true);
  });
});
