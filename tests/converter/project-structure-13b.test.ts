/**
 * Phase 13b — framework detection + route discovery.
 * No conversion / convertSource usage beyond smoke isolation.
 */

import { describe, expect, it } from "vitest";
import {
  analyzeProjectStructure,
  createProjectVirtualFSFromTextFiles,
  detectFramework,
  discoverProjectRoutes,
  extractProjectZip,
} from "@/lib/converter";
import { strToU8, zipSync } from "fflate";

function vfs(files: Record<string, string>) {
  return createProjectVirtualFSFromTextFiles(files);
}

describe("project Phase 13b: Next App Router", () => {
  it("discovers a single App Router page", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { next: "14.2.0", react: "18.0.0" },
        }),
        "app/page.tsx": "export default function Home(){return <h1/>}",
      }),
    );
    expect(analysis.manifest.framework).toBe("next-app");
    expect(analysis.routes).toHaveLength(1);
    expect(analysis.routes[0]).toMatchObject({
      path: "/",
      entryFile: "app/page.tsx",
      source: "app-router",
      confidence: "high",
      isDynamic: false,
    });
  });

  it("discovers nested App Router pages", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "15.0.0" } }),
        "app/page.tsx": "export default function Home(){return null}",
        "app/about/page.tsx": "export default function About(){return null}",
        "app/blog/posts/page.jsx": "export default function Posts(){return null}",
      }),
    );
    const paths = analysis.routes.map((r) => r.path).sort();
    expect(paths).toEqual(["/", "/about", "/blog/posts"]);
  });

  it("collects layout chain root → leaf", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/layout.tsx": "export default function Root({children}){return children}",
        "app/about/layout.tsx":
          "export default function AboutLayout({children}){return children}",
        "app/about/page.tsx": "export default function About(){return null}",
      }),
    );
    const about = analysis.routes.find((r) => r.path === "/about");
    expect(about?.layoutChain).toEqual([
      "app/layout.tsx",
      "app/about/layout.tsx",
    ]);
  });

  it("ignores route.ts handlers and still finds pages", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/page.tsx": "export default function Home(){return null}",
        "app/api/hello/route.ts":
          "export async function GET(){return Response.json({})}",
      }),
    );
    expect(analysis.routes.map((r) => r.path)).toEqual(["/"]);
    expect(
      analysis.diagnostics.some((d) => d.code === "app-route-handler-skipped"),
    ).toBe(true);
    expect(
      analysis.routes.every((r) => !r.entryFile.includes("route.ts")),
    ).toBe(true);
  });

  it("discovers dynamic App Router segments with low confidence", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/blog/[slug]/page.tsx":
          "export default function Post(){return null}",
        "app/docs/[...slug]/page.tsx":
          "export default function Docs(){return null}",
        "app/shop/[[...slug]]/page.tsx":
          "export default function Shop(){return null}",
      }),
    );
    const byPath = Object.fromEntries(
      analysis.routes.map((r) => [r.path, r]),
    );
    expect(byPath["/blog/[slug]"]?.isDynamic).toBe(true);
    expect(byPath["/blog/[slug]"]?.confidence).toBe("low");
    expect(byPath["/blog/[slug]"]?.dynamicSegments).toEqual(["slug"]);
    expect(byPath["/docs/[...slug]"]?.dynamicSegments).toEqual(["...slug"]);
    expect(byPath["/shop/[[...slug]]"]?.dynamicSegments).toEqual(["...slug"]);
    // Do not invent concrete URLs
    expect(analysis.routes.some((r) => r.path === "/blog/hello")).toBe(false);
  });

  it("strips route groups from URL paths", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/(marketing)/pricing/page.tsx":
          "export default function Pricing(){return null}",
      }),
    );
    expect(analysis.routes[0]?.path).toBe("/pricing");
  });
});

describe("project Phase 13b: Next Pages Router", () => {
  it("discovers Pages Router routes and maps paths", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "13.5.0" } }),
        "pages/index.tsx": "export default function Home(){return null}",
        "pages/about.tsx": "export default function About(){return null}",
        "pages/blog/[id].js": "export default function Post(){return null}",
      }),
    );
    expect(analysis.manifest.framework).toBe("next-pages");
    const paths = analysis.routes.map((r) => r.path).sort();
    expect(paths).toEqual(["/", "/about", "/blog/[id]"]);
    expect(
      analysis.routes.find((r) => r.path === "/blog/[id]")?.confidence,
    ).toBe("low");
  });

  it("excludes _app/_document/_error and pages/api", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "13.0.0" } }),
        "pages/_app.tsx": "export default function App({Component}){return <Component/>}",
        "pages/_document.tsx": "export default function Doc(){return null}",
        "pages/_error.tsx": "export default function Err(){return null}",
        "pages/index.tsx": "export default function Home(){return null}",
        "pages/api/hello.ts": "export default function handler(){}",
      }),
    );
    expect(analysis.routes.map((r) => r.path)).toEqual(["/"]);
    expect(
      analysis.diagnostics.some((d) => d.code === "pages-api-skipped"),
    ).toBe(true);
  });

  it("detects next-hybrid when both app and pages exist", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ dependencies: { next: "14.0.0" } }),
        "app/page.tsx": "export default function A(){return null}",
        "pages/about.tsx": "export default function B(){return null}",
      }),
    );
    expect(analysis.manifest.framework).toBe("next-hybrid");
    expect(analysis.routes.map((r) => r.id).sort()).toEqual([
      "app:/",
      "pages:/about",
    ]);
  });
});

describe("project Phase 13b: Vite / CRA / plain React", () => {
  it("detects Vite and falls back to a single entry route with warning", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "vite.config.ts": "export default {}",
        "src/main.tsx": "import App from './App';",
        "src/App.tsx": "export default function App(){return <div/>}",
      }),
    );
    expect(analysis.manifest.framework).toBe("vite-react");
    expect(analysis.routes).toHaveLength(1);
    expect(analysis.routes[0]).toMatchObject({
      path: "/",
      entryFile: "src/main.tsx",
      source: "spa-entry",
      kind: "entry",
    });
    expect(
      analysis.diagnostics.some((d) => d.code === "spa-router-not-static"),
    ).toBe(true);
  });

  it("detects CRA and uses src/index entry", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0", "react-scripts": "5.0.1" },
        }),
        "src/index.tsx": "import App from './App';",
        "src/App.tsx": "export default function App(){return <div/>}",
      }),
    );
    expect(analysis.manifest.framework).toBe("cra");
    expect(analysis.routes[0]?.entryFile).toBe("src/index.tsx");
  });

  it("discovers statically analyzable react-router paths", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            react: "18.0.0",
            "react-router-dom": "6.0.0",
          },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": "import App from './App';",
        "src/App.tsx": `
          import { Routes, Route } from 'react-router-dom';
          export default function App() {
            return (
              <Routes>
                <Route path="/" element={null} />
                <Route path="/about" element={null} />
                <Route path="/pricing" element={null} />
              </Routes>
            );
          }
        `,
      }),
    );
    expect(analysis.routes.map((r) => r.path).sort()).toEqual([
      "/",
      "/about",
      "/pricing",
    ]);
    expect(analysis.routes.every((r) => r.source === "react-router-static")).toBe(
      true,
    );
  });

  it("does not treat Vite src/pages as Next Pages Router", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0", "react-router-dom": "6.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "vite.config.ts": "export default {}",
        "src/main.tsx": `
          import { Routes, Route } from "react-router-dom";
          export default function App() {
            return (
              <Routes>
                <Route path="/" element={null} />
                <Route path="/about" element={null} />
              </Routes>
            );
          }
        `,
        "src/pages/Home.tsx":
          "export function Home(){return <h1>Home</h1>;}",
      }),
    );
    expect(analysis.manifest.framework).toBe("vite-react");
    expect(analysis.routes.map((r) => r.path).sort()).toEqual(["/", "/about"]);
  });

  it("discovers createBrowserRouter object paths", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0", "react-router-dom": "6.22.0" },
          devDependencies: { vite: "5.2.0" },
        }),
        "src/main.tsx": `
          import { createBrowserRouter } from 'react-router-dom';
          const router = createBrowserRouter([
            { path: '/', element: null },
            { path: '/contact', element: null },
          ]);
          export default router;
        `,
      }),
    );
    expect(analysis.routes.map((r) => r.path).sort()).toEqual([
      "/",
      "/contact",
    ]);
  });

  it("warns on ambiguous SPA entries without inventing multiple routes", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": "export {}",
        "src/main.jsx": "export {}",
      }),
    );
    expect(analysis.routes).toHaveLength(1);
    expect(analysis.routes[0]?.entryFile).toBe("src/main.tsx");
    expect(
      analysis.diagnostics.some((d) => d.code === "ambiguous-spa-entry"),
    ).toBe(true);
  });

  it("falls back to TanStack createFileRoute when classic SPA entry is absent", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            react: "18.0.0",
            "@tanstack/react-router": "1.0.0",
          },
          devDependencies: { vite: "5.0.0" },
        }),
        "vite.config.ts": "export default {}",
        "src/routes/index.tsx": `
          import { createFileRoute } from '@tanstack/react-router';
          function Index(){ return <h1>Home</h1>; }
          export const Route = createFileRoute('/')({
            component: Index,
          });
        `,
      }),
    );
    expect(analysis.manifest.framework).toBe("vite-react");
    expect(analysis.routes.length).toBeGreaterThanOrEqual(1);
    expect(analysis.routes[0]).toMatchObject({
      path: "/",
      entryFile: "src/routes/index.tsx",
      source: "tanstack-file-route",
      kind: "page",
    });
    expect(
      analysis.diagnostics.some((d) => d.code === "spa-entry-missing"),
    ).toBe(false);
    expect(
      analysis.diagnostics.some((d) => d.code === "tanstack-file-route-discovered"),
    ).toBe(true);
  });

  it("skips TanStack __root layout and still discovers index /", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            react: "18.0.0",
            "@tanstack/react-router": "1.0.0",
          },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/routes/__root.tsx": `
          import { createRootRoute } from '@tanstack/react-router';
          export const Route = createRootRoute({ component: () => null });
        `,
        "src/routes/index.tsx": `
          import { createFileRoute } from '@tanstack/react-router';
          export const Route = createFileRoute('/')({ component: () => null });
        `,
      }),
    );
    expect(analysis.routes.map((r) => r.path)).toEqual(["/"]);
    expect(analysis.routes[0]?.entryFile).toBe("src/routes/index.tsx");
    expect(
      analysis.routes.every((r) => !r.entryFile.includes("__root")),
    ).toBe(true);
    expect(
      analysis.diagnostics.some((d) => d.code === "tanstack-root-layout-skipped"),
    ).toBe(true);
  });

  it("does not use TanStack fallback when classic SPA entry exists", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            react: "18.0.0",
            "@tanstack/react-router": "1.0.0",
          },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": "import App from './App';",
        "src/App.tsx": "export default function App(){return <div/>}",
        "src/routes/index.tsx": `
          import { createFileRoute } from '@tanstack/react-router';
          export const Route = createFileRoute('/')({ component: () => null });
        `,
      }),
    );
    expect(analysis.routes).toHaveLength(1);
    expect(analysis.routes[0]).toMatchObject({
      path: "/",
      entryFile: "src/main.tsx",
      source: "spa-entry",
    });
    expect(
      analysis.diagnostics.some((d) => d.code === "tanstack-file-route-discovered"),
    ).toBe(false);
  });

  it("discovers Festive-like TanStack Start routes without treating router.tsx as /", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          name: "festive-lights-pro",
          dependencies: {
            react: "19.0.0",
            "@tanstack/react-router": "1.114.0",
            "@tanstack/react-start": "1.114.0",
          },
          devDependencies: { vite: "6.0.0" },
        }),
        "vite.config.ts": "export default {}",
        "src/start.ts": "export {}",
        "src/router.tsx": `
          import { createRouter } from '@tanstack/react-router';
          import { routeTree } from './routeTree.gen';
          export const router = createRouter({ routeTree });
        `,
        "src/routes/__root.tsx": `
          import { createRootRoute } from '@tanstack/react-router';
          export const Route = createRootRoute({ component: () => null });
        `,
        "src/routes/index.tsx": `
          import { createFileRoute } from '@tanstack/react-router';
          function Index(){ return <main/>; }
          export const Route = createFileRoute('/')({
            component: Index,
          });
        `,
      }),
    );
    expect(analysis.manifest.framework).toBe("vite-react");
    expect(analysis.routes.map((r) => r.path)).toContain("/");
    expect(analysis.routes.some((r) => r.entryFile === "src/router.tsx")).toBe(
      false,
    );
    expect(analysis.routes.find((r) => r.path === "/")?.entryFile).toBe(
      "src/routes/index.tsx",
    );
    expect(
      analysis.diagnostics.some((d) => d.code === "spa-entry-missing"),
    ).toBe(false);
    expect(
      analysis.diagnostics.some((d) => d.code === "tanstack-router-detected"),
    ).toBe(true);
  });

  it("preserves TanStack dynamic $param paths without executing code", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({
          dependencies: {
            react: "18.0.0",
            "@tanstack/react-router": "1.0.0",
          },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/routes/products.$productId.tsx": `
          import { createFileRoute } from '@tanstack/react-router';
          export const Route = createFileRoute('/products/$productId')({
            component: () => null,
          });
        `,
      }),
    );
    expect(analysis.routes).toHaveLength(1);
    expect(analysis.routes[0]).toMatchObject({
      path: "/products/$productId",
      entryFile: "src/routes/products.$productId.tsx",
      source: "tanstack-file-route",
      isDynamic: true,
      dynamicSegments: ["productId"],
      confidence: "low",
    });
    expect(
      analysis.diagnostics.some((d) => d.code === "tanstack-file-route-dynamic"),
    ).toBe(true);
  });
});

describe("project Phase 13b: detection edge cases", () => {
  it("handles missing package.json", () => {
    const manifest = detectFramework(
      vfs({
        "app/page.tsx": "export default function Home(){return null}",
      }),
    );
    expect(manifest.framework).toBe("next-app");
    expect(manifest.frameworkConfidence).toBe("medium");
    expect(
      manifest.diagnostics.some((d) => d.code === "package-json-missing"),
    ).toBe(true);
  });

  it("handles malformed package.json", () => {
    const manifest = detectFramework(
      vfs({
        "package.json": "{not-json",
        "src/main.tsx": "export {}",
      }),
    );
    expect(
      manifest.diagnostics.some((d) => d.code === "package-json-malformed"),
    ).toBe(true);
  });

  it("classifies unknown/plain projects without inventing routes", () => {
    const analysis = analyzeProjectStructure(
      vfs({
        "package.json": JSON.stringify({ name: "notes" }),
        "README.md": "# hi",
      }),
    );
    expect(analysis.manifest.framework).toBe("unknown");
    expect(analysis.routes).toHaveLength(0);
    expect(
      analysis.diagnostics.some((d) => d.code === "no-routes-discovered"),
    ).toBe(true);
  });

  it("works on VFS produced by Phase 13a ZIP extract", () => {
    const zip = zipSync({
      "package.json": strToU8(
        JSON.stringify({ dependencies: { next: "14.0.0", react: "18.0.0" } }),
      ),
      "app/page.tsx": strToU8(
        "export default function Home(){return <h1>Hi</h1>}",
      ),
      "app/about/page.tsx": strToU8(
        "export default function About(){return <h1>About</h1>}",
      ),
    });
    const extracted = extractProjectZip(zip);
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    const routes = discoverProjectRoutes(
      extracted.vfs,
      detectFramework(extracted.vfs),
    );
    expect(routes.routes.map((r) => r.path).sort()).toEqual(["/", "/about"]);
  });
});
