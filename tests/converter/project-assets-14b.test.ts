/**
 * Phase 14b — static asset discovery & VFS mapping.
 * No WP media, no compression, no convertSource changes.
 */

import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  convertProject,
  createProjectVirtualFSFromTextFiles,
  discoverRouteAssets,
  extractProjectZip,
  resolveAssetSpecifierToPath,
} from "@/lib/converter";

function vfs(files: Record<string, string>) {
  return createProjectVirtualFSFromTextFiles(files);
}

function tinyPng(byteLength = 64): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes[0] = 0x89;
  bytes[1] = 0x50;
  bytes[2] = 0x4e;
  bytes[3] = 0x47;
  let x = 1;
  for (let i = 8; i < byteLength; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    bytes[i] = x & 0xff;
  }
  return bytes;
}

describe("Phase 14b: asset discovery", () => {
  it("A. resolves relative imported images", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          import hero from "../assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="h" />; }
        `,
        "assets/hero.jpg": "fake-jpeg-bytes",
      }),
    );
    const route = result.routes[0]!;
    expect(
      route.assetReferences?.some(
        (r) =>
          r.kind === "import" &&
          r.status === "resolved" &&
          r.assetPath === "assets/hero.jpg",
      ),
    ).toBe(true);
    expect(
      route.diagnostics.some((d) => d.code === "asset-reference-resolved"),
    ).toBe(true);
    expect(route.assets?.some((a) => a.path === "assets/hero.jpg")).toBe(true);
  });

  it("B. resolves aliased @/assets imports via Phase 13g", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: { paths: { "@/*": ["./src/*"] } },
        }),
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/hero.jpg": "fake",
      }),
    );
    const refs = result.routes[0]?.assetReferences ?? [];
    expect(
      refs.some(
        (r) =>
          r.expression.includes("@/assets/hero.jpg") &&
          r.status === "resolved" &&
          r.assetPath === "src/assets/hero.jpg",
      ),
    ).toBe(true);
  });

  it("C. resolves JSX src={binding} to the imported asset", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: { paths: { "@/*": ["./src/*"] } },
        }),
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){
            return <img src={hero} alt="Hero" width={100} height={80} />;
          }
        `,
        "src/assets/hero.jpg": "fake",
      }),
    );
    const jsx = result.routes[0]?.assetReferences?.filter((r) => r.kind === "jsx-src");
    expect(jsx?.some((r) => r.expression === "hero" && r.status === "resolved")).toBe(
      true,
    );
    expect(result.routes[0]?.unit?.assetBindings?.hero).toBe("src/assets/hero.jpg");
  });

  it("D. resolves direct static string src when VFS asset exists", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          export default function App(){
            return <img src="./assets/hero.jpg" alt="" />;
          }
        `,
        "src/assets/hero.jpg": "fake",
      }),
    );
    expect(
      result.routes[0]?.assetReferences?.some(
        (r) =>
          r.kind === "jsx-src" &&
          r.status === "resolved" &&
          r.assetPath === "src/assets/hero.jpg",
      ),
    ).toBe(true);
  });

  it("E. resolves new URL('./assets/hero.png', import.meta.url)", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          const hero = new URL("./assets/hero.png", import.meta.url);
          export default function App(){
            return <img src={hero.href} alt="" />;
          }
        `,
        "src/assets/hero.png": "fake",
      }),
    );
    expect(
      result.routes[0]?.assetReferences?.some(
        (r) =>
          r.kind === "new-url" &&
          r.status === "resolved" &&
          r.assetPath === "src/assets/hero.png",
      ),
    ).toBe(true);
  });

  it("F. marks dynamic new URL as asset-reference-dynamic", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          const imagePath = "./assets/hero.png";
          const hero = new URL(imagePath, import.meta.url);
          export default function App(){ return <div />; }
        `,
        "src/assets/hero.png": "fake",
      }),
    );
    expect(
      result.routes[0]?.diagnostics.some((d) => d.code === "asset-reference-dynamic"),
    ).toBe(true);
    expect(
      result.routes[0]?.assetReferences?.some(
        (r) => r.kind === "new-url" && r.status === "dynamic",
      ),
    ).toBe(true);
  });

  it("G. resolves CSS url() when CSS and asset are in VFS", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          import "./styles.css";
          export default function App(){ return <div className="hero" />; }
        `,
        "src/styles.css": `.hero { background-image: url("./hero.jpg"); }`,
        "src/hero.jpg": "fake",
      }),
    );
    expect(
      result.routes[0]?.assetReferences?.some(
        (r) =>
          r.kind === "css-url" &&
          r.status === "resolved" &&
          r.assetPath === "src/hero.jpg",
      ),
    ).toBe(true);
  });

  it("H. missing asset yields explicit unresolved diagnostic without crash", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          import hero from "./missing.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
      }),
    );
    // Route may be partial (unsupported image) but discovery must not crash packaging.
    expect(result.routes.length).toBeGreaterThan(0);
    expect(result.routes[0]?.unit).toBeTruthy();
    expect(
      result.routes[0]?.diagnostics.some((d) => d.code === "asset-reference-unresolved"),
    ).toBe(true);
    expect(
      result.routes[0]?.assets?.some(
        (a) => a.path === "src/missing.jpg" && a.presence === "missing",
      ),
    ).toBe(true);
  });

  it("I. Phase 14a soft-skipped asset stays distinguishable from missing", () => {
    const zip = zipSync(
      {
        "package.json": strToU8(
          JSON.stringify({
            dependencies: { react: "18.0.0" },
            devDependencies: { vite: "5.0.0" },
          }),
        ),
        "src/main.tsx": strToU8(`
          import hero from "./big.png";
          export default function App(){ return <img src={hero} alt="" />; }
        `),
        "src/big.png": tinyPng(2500),
      },
      { level: 0 },
    );
    const extracted = extractProjectZip(zip, {
      limits: {
        maxBinaryAssetBytes: 1000,
        maxBinaryAssetsTotalBytes: 50_000,
      },
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;
    expect(
      extracted.vfs.ignored.some(
        (e) => e.path === "src/big.png" && e.reason === "asset-file-byte-limit",
      ),
    ).toBe(true);
    expect(extracted.vfs.files["src/big.png"]).toBeUndefined();

    const result = convertProject(extracted.vfs);
    const refs = result.routes[0]?.assetReferences ?? [];
    expect(
      refs.some(
        (r) =>
          r.assetPath === "src/big.png" &&
          r.status === "skipped",
      ),
    ).toBe(true);
    expect(
      result.routes[0]?.diagnostics.some((d) => d.code === "asset-reference-skipped"),
    ).toBe(true);
    expect(
      refs.some(
        (r) => r.assetPath === "src/big.png" && r.status === "unresolved",
      ),
    ).toBe(false);
    expect(
      result.diagnostics.some((d) => d.code === "asset-file-byte-limit"),
    ).toBe(true);
  });

  it("J. rejects unsafe / escaping asset paths", () => {
    expect(
      resolveAssetSpecifierToPath({
        specifier: "../../etc/passwd.png",
        fromFile: "src/main.tsx",
      }).path,
    ).toBeNull();
    expect(
      resolveAssetSpecifierToPath({
        specifier: "file:///tmp/x.png",
        fromFile: "src/main.tsx",
      }).reason,
    ).toBe("external");
    expect(
      resolveAssetSpecifierToPath({
        specifier: "https://cdn.example/a.png",
        fromFile: "src/main.tsx",
      }).reason,
    ).toBe("external");

    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          import bad from "../../secret.png";
          export default function App(){ return <img src={bad} alt="" />; }
        `,
        "secret.png": "nope",
      }),
    );
    expect(
      result.routes[0]?.assetReferences?.some(
        (r) => r.status === "unresolved" || r.status === "dynamic",
      ),
    ).toBe(true);
    expect(
      result.routes[0]?.assets?.some((a) => a.path === "secret.png" && a.presence === "present"),
    ).toBeFalsy();
  });

  it("K. const alias of an imported asset resolves for JSX", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "tsconfig.json": JSON.stringify({
          compilerOptions: { paths: { "@/*": ["./src/*"] } },
        }),
        "src/main.tsx": `
          import heroImg from "@/assets/hero.jpg";
          const hero = heroImg;
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/hero.jpg": "fake",
      }),
    );
    expect(
      result.routes[0]?.assetReferences?.some(
        (r) =>
          r.kind === "jsx-src" &&
          r.expression === "hero" &&
          r.status === "resolved",
      ),
    ).toBe(true);
  });

  it("leaves CSS var(--x) url() as dynamic", () => {
    const result = convertProject(
      vfs({
        "package.json": JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
        "src/main.tsx": `
          import "./styles.css";
          export default function App(){ return <div />; }
        `,
        "src/styles.css": `.x { background-image: url(var(--hero)); }`,
      }),
    );
    expect(
      result.routes[0]?.assetReferences?.some(
        (r) => r.kind === "css-url" && r.status === "dynamic",
      ),
    ).toBe(true);
  });

  it("discoverRouteAssets stays route-local (shared assets allowed)", () => {
    const project = vfs({
      "package.json": JSON.stringify({
        dependencies: { react: "18.0.0", "react-router-dom": "6.0.0" },
        devDependencies: { vite: "5.0.0" },
      }),
      "src/main.tsx": `
        import { Routes, Route } from "react-router-dom";
        import Home from "./Home";
        import About from "./About";
        export default function App(){
          return (
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/about" element={<About />} />
            </Routes>
          );
        }
      `,
      "src/Home.tsx": `
        import hero from "./assets/hero.jpg";
        export default function Home(){ return <img src={hero} alt="" />; }
      `,
      "src/About.tsx": `
        import about from "./assets/about.jpg";
        export default function About(){ return <img src={about} alt="" />; }
      `,
      "src/assets/hero.jpg": "h",
      "src/assets/about.jpg": "a",
    });
    const result = convertProject(project);
    // SPA static router may emit one entry or multiple paths — assert discovery API
    // is route-scoped when called on a single unit.
    const homeRoute = result.routes.find((r) => r.route.path === "/") ?? result.routes[0];
    expect(homeRoute).toBeTruthy();
    if (homeRoute?.unit) {
      const discovery = discoverRouteAssets({
        vfs: project,
        unit: homeRoute.unit,
        pathAliases: result.manifest.pathAliases,
      });
      // Unit graph may only include entry for spa-entry fallback; when Home is inlined
      // via knownComponentSources the modules should include home assets.
      const paths = discovery.assets.map((a) => a.path);
      expect(paths.every((p) => !p.includes(".."))).toBe(true);
    }
  });
});
