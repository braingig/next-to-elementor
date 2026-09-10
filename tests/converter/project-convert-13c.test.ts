/**
 * Phase 13c — per-route ConversionUnit → convertSource → ProjectConversionResult.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeProjectStructure,
  buildConversionUnit,
  convertProject,
  convertSource,
  createProjectVirtualFSFromTextFiles,
  loadElementorFreeCatalog,
  validateElementorDocument,
  type ElementorDocument,
  type ProjectConversionResult,
} from "@/lib/converter";

const catalog = loadElementorFreeCatalog("4.2.4");

function vfs(files: Record<string, string>) {
  return createProjectVirtualFSFromTextFiles(files);
}

function assertValidDoc(json: unknown): asserts json is ElementorDocument {
  expect(json).not.toBeNull();
  const doc = json as ElementorDocument;
  expect(doc.version).toBe("0.4");
  expect(validateElementorDocument(doc, catalog).passed).toBe(true);
}

function usableRoutes(result: ProjectConversionResult) {
  return result.routes.filter((r) => r.conversion.elementorJson != null);
}

describe("project Phase 13c: convertProject", () => {
  it("converts one discovered route into one Elementor document", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { next: "14.0.0", react: "18.0.0" },
        }),
        "app/page.tsx": `
          export default function Home() {
            return <h1 className="text-xl">Home</h1>;
          }
        `,
      }),
    );

    expect(result.routes).toHaveLength(1);
    expect(result.outcome === "complete" || result.outcome === "partial").toBe(
      true,
    );
    assertValidDoc(result.routes[0]!.conversion.elementorJson);
    expect(result.routes[0]!.route.path).toBe("/");
  });

  it("converts multiple routes into independent Elementor documents", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { next: "14.0.0", react: "18.0.0" },
        }),
        "app/page.tsx":
          "export default function Home(){return <h1>Home</h1>;}",
        "app/about/page.tsx":
          "export default function About(){return <h1>About</h1>;}",
      }),
    );

    expect(result.routes).toHaveLength(2);
    const docs = usableRoutes(result).map((r) => r.conversion.elementorJson);
    expect(docs).toHaveLength(2);
    expect(docs[0]).not.toBe(docs[1]);
    for (const doc of docs) assertValidDoc(doc);
    expect(result.routes.map((r) => r.route.path).sort()).toEqual([
      "/",
      "/about",
    ]);
  });

  it("converts a Next App Router page", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/pricing/page.tsx": `
          export default function Pricing() {
            return (
              <section>
                <h2>Pricing</h2>
                <p>Simple plans</p>
              </section>
            );
          }
        `,
      }),
    );
    expect(result.manifest.framework).toBe("next-app");
    expect(result.routes[0]?.route.path).toBe("/pricing");
    assertValidDoc(result.routes[0]!.conversion.elementorJson);
  });

  it("composes App Router layoutChain when children binding is safe", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/layout.tsx": `
          export default function RootLayout({ children }: { children: React.ReactNode }) {
            return <div className="shell">{children}</div>;
          }
        `,
        "app/about/page.tsx": `
          export default function About() {
            return <h1>About</h1>;
          }
        `,
      }),
    );

    const route = result.routes[0]!;
    expect(route.unit?.layoutMode).toBe("composed");
    expect(route.unit?.layoutChain).toEqual(["app/layout.tsx"]);
    expect(route.unit?.entrySource).toContain("__ProjectLayout0");
    expect(route.unit?.entrySource).toContain("__ProjectPage");
    assertValidDoc(route.conversion.elementorJson);
    expect(
      route.diagnostics.some((d) => d.code === "layout-composed"),
    ).toBe(true);
  });

  it("converts a Pages Router route", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "13.0.0" } }),
        "pages/index.tsx":
          "export default function Home(){return <h1>Home</h1>;}",
        "pages/contact.tsx":
          "export default function Contact(){return <h1>Contact</h1>;}",
      }),
    );
    expect(result.manifest.framework).toBe("next-pages");
    expect(result.routes.map((r) => r.route.path).sort()).toEqual([
      "/",
      "/contact",
    ]);
    for (const r of result.routes) {
      assertValidDoc(r.conversion.elementorJson);
    }
  });

  it("converts a Vite/SPA single entry", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          export default function App() {
            return <h1 className="text-lg">Vite App</h1>;
          }
        `,
      }),
    );
    expect(result.manifest.framework).toBe("vite-react");
    expect(result.routes).toHaveLength(1);
    assertValidDoc(result.routes[0]!.conversion.elementorJson);
  });

  it("isolates a failed route without destroying successful ones", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/page.tsx":
          "export default function Home(){return <h1>Home</h1>;}",
        "app/broken/page.tsx":
          "export default function Broken( { return <h1/> }", // syntax error
      }),
    );

    expect(result.routes).toHaveLength(2);
    const home = result.routes.find((r) => r.route.path === "/");
    const broken = result.routes.find((r) => r.route.path === "/broken");
    expect(home?.conversion.elementorJson).not.toBeNull();
    assertValidDoc(home!.conversion.elementorJson);
    expect(broken?.outcome).toBe("failed");
    expect(broken?.conversion.elementorJson).toBeNull();
    expect(result.outcome).toBe("partial");
  });

  it("keeps dynamic routes as patterns (no invented URLs)", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/blog/[slug]/page.tsx":
          "export default function Post(){return <h1>Post</h1>;}",
      }),
    );
    expect(result.routes).toHaveLength(1);
    expect(result.routes[0]!.route.path).toBe("/blog/[slug]");
    expect(result.routes[0]!.route.isDynamic).toBe(true);
    expect(result.routes.some((r) => r.route.path === "/blog/hello")).toBe(
      false,
    );
    assertValidDoc(result.routes[0]!.conversion.elementorJson);
  });

  it("supports a shared component used by multiple routes", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "components/Title.tsx": `
          export function Title({ text }: { text: string }) {
            return <h2>{text}</h2>;
          }
        `,
        "app/page.tsx": `
          import { Title } from '../components/Title';
          export default function Home(){ return <Title text="Home" />; }
        `,
        "app/about/page.tsx": `
          import { Title } from '../../components/Title';
          export default function About(){ return <Title text="About" />; }
        `,
      }),
    );

    expect(usableRoutes(result)).toHaveLength(2);
    for (const r of result.routes) {
      assertValidDoc(r.conversion.elementorJson);
      expect(r.unit?.knownComponentSources.Title).toContain("function Title");
    }
  });

  it("keeps same binding names from different files distinct across routes", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "ui/a/Button.tsx": `
          export function Button(){ return <button>A</button>; }
        `,
        "ui/b/Button.tsx": `
          export function Button(){ return <a href="/b">B</a>; }
        `,
        "app/a/page.tsx": `
          import { Button } from '../../ui/a/Button';
          export default function PageA(){ return <Button />; }
        `,
        "app/b/page.tsx": `
          import { Button } from '../../ui/b/Button';
          export default function PageB(){ return <Button />; }
        `,
      }),
    );

    const a = result.routes.find((r) => r.route.path === "/a")!;
    const b = result.routes.find((r) => r.route.path === "/b")!;
    expect(a.unit?.knownComponentSources.Button).toContain("<button>");
    expect(b.unit?.knownComponentSources.Button).toContain("<a href");
    expect(a.unit?.knownComponentSources.Button).not.toBe(
      b.unit?.knownComponentSources.Button,
    );
    assertValidDoc(a.conversion.elementorJson);
    assertValidDoc(b.conversion.elementorJson);
  });

  it("uses route-scoped CSS and does not pull unrelated project CSS", () => {
    const files = {
      "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
      "app/page.tsx": `
        import './home.css';
        export default function Home(){ return <h1 className="home">Home</h1>; }
      `,
      "app/home.css": ".home { color: red; }",
      "app/about/page.tsx": `
        import './about.css';
        export default function About(){ return <h1 className="about">About</h1>; }
      `,
      "app/about/about.css": ".about { color: blue; }",
      "styles/global-unused.css": "body { margin: 0; }",
    };
    const projectVfs = vfs(files);
    const analysis = analyzeProjectStructure(projectVfs);
    const homeRoute = analysis.routes.find((r) => r.path === "/")!;
    const aboutRoute = analysis.routes.find((r) => r.path === "/about")!;

    const homeUnit = buildConversionUnit(projectVfs, homeRoute, {
      framework: analysis.manifest.framework,
    });
    const aboutUnit = buildConversionUnit(projectVfs, aboutRoute, {
      framework: analysis.manifest.framework,
    });

    expect(homeUnit.cssPaths).toEqual(["app/home.css"]);
    expect(aboutUnit.cssPaths).toEqual(["app/about/about.css"]);
    expect(homeUnit.cssPaths).not.toContain("styles/global-unused.css");
    expect(aboutUnit.cssPaths).not.toContain("app/home.css");

    const result = convertProject(projectVfs, { analysis });
    expect(usableRoutes(result).length).toBe(2);
  });

  it("preserves existing convertSource result shape on each route", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/page.tsx":
          "export default function Home(){return <h1>Home</h1>;}",
      }),
    );
    const conversion = result.routes[0]!.conversion;
    expect(conversion).toHaveProperty("outcome");
    expect(conversion).toHaveProperty("elementorJson");
    expect(conversion).toHaveProperty("report");
    expect(conversion).toHaveProperty("catalogVersion");
    expect(conversion).toHaveProperty("elementorTarget");
    expect(conversion).toHaveProperty("irVersion");
    expect(conversion.report).toHaveProperty("summary");
    expect(conversion.report).toHaveProperty("nodes");
    expect(conversion.report).toHaveProperty("diagnostics");
    expect(conversion.report).toHaveProperty("freeCompliance");
  });

  it("fails the project when no usable routes exist", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({ name: "empty" }),
        "README.md": "# no app",
      }),
    );
    expect(result.outcome).toBe("failed");
    expect(result.routes).toHaveLength(0);
    expect(
      result.diagnostics.some((d) => d.code === "no-routes-to-convert"),
    ).toBe(true);
  });

  it("fails on empty VFS", () => {
    const result = convertProject(vfs({}));
    expect(result.outcome).toBe("failed");
    expect(
      result.diagnostics.some((d) => d.code === "empty-project-vfs"),
    ).toBe(true);
  });

  it("does not change standalone convertSource behavior", () => {
    const direct = convertSource({
      source: `export function Hero(){ return <h1 className="text-xl">Hi</h1>; }`,
      language: "tsx",
      css: "",
    });
    expect(direct.elementorJson).not.toBeNull();
    assertValidDoc(direct.elementorJson);
  });
});
