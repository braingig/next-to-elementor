/**
 * Phase 14c — opt-in WordPress media upload + pre-convert URL rewrite.
 */

import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  convertProject,
  convertProjectAsync,
  createProjectVirtualFSFromTextFiles,
  extractProjectZip,
  type ProjectMediaClient,
  type ProjectMediaUploadRequest,
  type ProjectMediaUploadResult,
} from "@/lib/converter";
import { runProjectConvert } from "@/app/lib/server-project";

function vfs(files: Record<string, string>) {
  return createProjectVirtualFSFromTextFiles(files);
}

function walkElementor(doc: unknown): Array<{ widgetType?: string; url?: string }> {
  const out: Array<{ widgetType?: string; url?: string }> = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as {
      widgetType?: string;
      settings?: { image?: { url?: string } };
      elements?: unknown[];
      content?: unknown[];
    };
    if (n.widgetType) {
      out.push({
        widgetType: n.widgetType,
        url: n.settings?.image?.url,
      });
    }
    for (const child of n.elements ?? n.content ?? []) walk(child);
  }
  walk(doc);
  return out;
}

function mockClient(
  impl: (
    req: ProjectMediaUploadRequest,
  ) => Promise<ProjectMediaUploadResult> | ProjectMediaUploadResult,
): ProjectMediaClient & { calls: ProjectMediaUploadRequest[] } {
  const calls: ProjectMediaUploadRequest[] = [];
  return {
    calls,
    async upload(req) {
      calls.push(req);
      return await impl(req);
    },
  };
}

const basePkg = {
  "package.json": JSON.stringify({
    dependencies: { react: "18.0.0" },
    devDependencies: { vite: "5.0.0" },
  }),
  "tsconfig.json": JSON.stringify({
    compilerOptions: { paths: { "@/*": ["./src/*"] } },
  }),
};

describe("Phase 14c: WordPress media pipeline", () => {
  it("1. media disabled: no client calls; behavior unchanged", async () => {
    const client = mockClient(async () => {
      throw new Error("should not be called");
    });
    const result = convertProject(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/hero.jpg": "fake-bytes",
      }),
    );
    expect(result.media).toBeUndefined();
    expect(client.calls).toHaveLength(0);
    expect(
      result.routes[0]?.conversion.report.summary.unsupportedCount,
    ).toBeGreaterThan(0);

    const asyncOff = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/hero.jpg": "fake-bytes",
      }),
      { media: { enabled: false, client } },
    );
    expect(asyncOff.media).toBeUndefined();
    expect(client.calls).toHaveLength(0);
  });

  it("2. successful single upload rewrites JSX binding to Elementor image URL", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: "https://wp.example/wp-content/uploads/hero.jpg",
      attachmentId: "12",
    }));

    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){
            return <img src={hero} alt="Hero" />;
          }
        `,
        "src/assets/hero.jpg": "JPEGDATA",
      }),
      { media: { enabled: true, client } },
    );

    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]?.assetPath).toBe("src/assets/hero.jpg");
    expect(Buffer.from(client.calls[0]!.bytes).toString("utf8")).toBe("JPEGDATA");
    expect(result.media?.uploadedCount).toBe(1);
    expect(result.outcome).not.toBe("failed");

    const widgets = walkElementor(result.routes[0]?.conversion.elementorJson);
    const image = widgets.find((w) => w.widgetType === "image");
    expect(image?.url).toBe("https://wp.example/wp-content/uploads/hero.jpg");
    expect(
      result.routes[0]?.conversion.report.nodes.some(
        (n) =>
          n.decision === "unsupported" && n.reasonCode === "asset-unresolved",
      ),
    ).toBe(false);
  });

  it("3. alias @/assets import resolves then uploads", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: `https://wp.example/${req.filename}`,
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/hero.jpg": "x",
      }),
      { media: { enabled: true, client } },
    );
    expect(client.calls[0]?.assetPath).toBe("src/assets/hero.jpg");
    expect(result.media?.uploads[0]?.url).toContain("hero.jpg");
  });

  it("4. relative import uploads correct VFS path", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: "https://wp.example/rel.jpg",
    }));
    await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "../assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "assets/hero.jpg": "x",
      }),
      { media: { enabled: true, client } },
    );
    expect(client.calls[0]?.assetPath).toBe("assets/hero.jpg");
  });

  it("5. shared asset across routes uploads once", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: "https://wp.example/logo.png",
    }));
    const result = await convertProjectAsync(
      vfs({
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
          import logo from "./assets/logo.png";
          export default function Home(){ return <img src={logo} alt="" />; }
        `,
        "src/About.tsx": `
          import logo from "./assets/logo.png";
          export default function About(){ return <img src={logo} alt="" />; }
        `,
        "src/assets/logo.png": "logo-bytes",
      }),
      { media: { enabled: true, client } },
    );
    const logoUploads = client.calls.filter(
      (c) => c.assetPath === "src/assets/logo.png",
    );
    expect(logoUploads).toHaveLength(1);
    expect(result.media?.uploadedCount).toBe(1);
    expect(result.media?.reusedCount).toBeGreaterThanOrEqual(1);
  });

  it("6. multiple assets all upload", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: `https://wp.example/${req.filename}`,
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import a from "@/assets/a.png";
          import b from "@/assets/b.webp";
          export default function App(){
            return <><img src={a} alt="" /><img src={b} alt="" /></>;
          }
        `,
        "src/assets/a.png": "a",
        "src/assets/b.webp": "b",
      }),
      { media: { enabled: true, client } },
    );
    expect(client.calls).toHaveLength(2);
    expect(result.media?.uploadedCount).toBe(2);
    expect(result.media?.failedCount).toBe(0);
  });

  it("7. single asset failure continues others; project partial", async () => {
    const client = mockClient(async (req) => {
      if (req.assetPath.endsWith("bad.jpg")) {
        return {
          assetPath: req.assetPath,
          status: "failed" as const,
          errorCode: "media-upload-failed",
          message: "upload failed",
        };
      }
      return {
        assetPath: req.assetPath,
        status: "uploaded" as const,
        url: `https://wp.example/${req.filename}`,
      };
    });
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import good from "@/assets/good.png";
          import bad from "@/assets/bad.jpg";
          export default function App(){
            return <><img src={good} alt="" /><img src={bad} alt="" /></>;
          }
        `,
        "src/assets/good.png": "g",
        "src/assets/bad.jpg": "b",
      }),
      { media: { enabled: true, client } },
    );
    expect(result.media?.uploadedCount).toBe(1);
    expect(result.media?.failedCount).toBe(1);
    expect(result.outcome).toBe("partial");
    expect(
      result.diagnostics.some((d) => d.code === "media-upload-failed"),
    ).toBe(true);
    const widgets = walkElementor(result.routes[0]?.conversion.elementorJson);
    expect(widgets.some((w) => w.url?.includes("good.png"))).toBe(true);
  });

  it("8. auth failure aborts with media-auth-failed", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "failed" as const,
      errorCode: "media-auth-failed",
      message: "WordPress media authentication failed (HTTP 401).",
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/hero.jpg": "x",
      }),
      { media: { enabled: true, client } },
    );
    expect(result.outcome).toBe("failed");
    expect(result.routes).toHaveLength(0);
    expect(
      result.diagnostics.some((d) => d.code === "media-auth-failed"),
    ).toBe(true);
  });

  it("9. unreachable yields media-unreachable", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "failed" as const,
      errorCode: "media-unreachable",
      message: "WordPress media endpoint unreachable: connect ECONNREFUSED",
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/hero.jpg": "x",
      }),
      { media: { enabled: true, client } },
    );
    expect(result.outcome).toBe("failed");
    expect(
      result.diagnostics.some((d) => d.code === "media-unreachable"),
    ).toBe(true);
  });

  it("10. invalid WP response does not rewrite", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "failed" as const,
      errorCode: "media-upload-invalid-response",
      message: "WordPress media response missing a public http(s) URL.",
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "@/assets/hero.jpg";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/hero.jpg": "x",
      }),
      { media: { enabled: true, client } },
    );
    expect(result.media?.failedCount).toBe(1);
    const widgets = walkElementor(result.routes[0]?.conversion.elementorJson);
    expect(widgets.some((w) => w.widgetType === "image" && w.url)).toBe(false);
  });

  it("11. missing configuration → media-config-missing", async () => {
    const prev = {
      url: process.env.N2E_WP_BASE_URL,
      user: process.env.N2E_WP_USER,
      pass: process.env.N2E_WP_APP_PASSWORD,
    };
    delete process.env.N2E_WP_BASE_URL;
    delete process.env.N2E_WP_USER;
    delete process.env.N2E_WP_APP_PASSWORD;
    try {
      const result = await convertProjectAsync(
        vfs({
          ...basePkg,
          "src/main.tsx": `
            import hero from "@/assets/hero.jpg";
            export default function App(){ return <img src={hero} alt="" />; }
          `,
          "src/assets/hero.jpg": "x",
        }),
        { media: { enabled: true } },
      );
      expect(result.outcome).toBe("failed");
      expect(
        result.diagnostics.some((d) => d.code === "media-config-missing"),
      ).toBe(true);
    } finally {
      if (prev.url) process.env.N2E_WP_BASE_URL = prev.url;
      if (prev.user) process.env.N2E_WP_USER = prev.user;
      if (prev.pass) process.env.N2E_WP_APP_PASSWORD = prev.pass;
    }
  });

  it("12. soft-skipped asset is never uploaded", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: `https://wp.example/${req.filename}`,
    }));
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
          import ok from "./ok.png";
          export default function App(){
            return <><img src={hero} alt="" /><img src={ok} alt="" /></>;
          }
        `),
        "src/big.png": (() => {
          const b = new Uint8Array(2500);
          b[0] = 0x89;
          b[1] = 0x50;
          return b;
        })(),
        "src/ok.png": strToU8("small"),
      },
      { level: 0 },
    );
    const extracted = extractProjectZip(zip, {
      limits: { maxBinaryAssetBytes: 1000, maxBinaryAssetsTotalBytes: 50_000 },
    });
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const result = await convertProjectAsync(extracted.vfs, {
      media: { enabled: true, client },
    });
    expect(
      client.calls.every((c) => c.assetPath !== "src/big.png"),
    ).toBe(true);
    expect(
      result.media?.uploads.some(
        (u) =>
          u.assetPath === "src/big.png" &&
          u.status === "skipped",
      ),
    ).toBe(true);
  });

  it("13. SVG never uploaded by default", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: `https://wp.example/${req.filename}`,
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import icon from "@/assets/icon.svg";
          export default function App(){ return <img src={icon} alt="" />; }
        `,
        "src/assets/icon.svg": "<svg/>",
      }),
      { media: { enabled: true, client } },
    );
    expect(client.calls).toHaveLength(0);
    expect(
      result.media?.uploads.some(
        (u) => u.skipReason === "svg-upload-disabled",
      ),
    ).toBe(true);
  });

  it("14. dynamic new URL never receives invented URL", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: "https://wp.example/should-not-apply.png",
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          const imagePath = "./assets/hero.png";
          const hero = new URL(imagePath, import.meta.url);
          export default function App(){ return <div />; }
        `,
        "src/assets/hero.png": "x",
      }),
      { media: { enabled: true, client } },
    );
    // Asset may still be discovered via other refs, but dynamic new-url must stay dynamic
    expect(
      result.routes[0]?.assetReferences?.some(
        (r) => r.kind === "new-url" && r.status === "dynamic",
      ),
    ).toBe(true);
  });

  it("15. CSS url() rewrites after successful upload", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: "https://wp.example/hero.jpg",
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import "./styles.css";
          export default function App(){ return <div className="hero" />; }
        `,
        "src/styles.css": `.hero { background-image: url("./hero.jpg"); }`,
        "src/hero.jpg": "x",
      }),
      { media: { enabled: true, client } },
    );
    expect(client.calls.some((c) => c.assetPath === "src/hero.jpg")).toBe(true);
    expect(result.routes[0]?.unit?.css.some((c) => c.includes("https://wp.example/hero.jpg"))).toBe(
      true,
    );
  });

  it("15b. ObjectProperty asset bindings rewrite for static map fields", async () => {
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: `https://wp.example/${req.filename}`,
    }));
    const result = await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import a from "@/assets/a.jpg";
          import b from "@/assets/b.jpg";
          const ITEMS = [
            { src: a, title: "A" },
            { src: b, title: "B" },
          ];
          export default function App(){
            return (
              <div>
                {ITEMS.map((item) => (
                  <img src={item.src} alt={item.title} />
                ))}
              </div>
            );
          }
        `,
        "src/assets/a.jpg": "aa",
        "src/assets/b.jpg": "bb",
      }),
      { media: { enabled: true, client } },
    );
    expect(client.calls).toHaveLength(2);
    const widgets = walkElementor(result.routes[0]?.conversion.elementorJson);
    const urls = widgets
      .filter((w) => w.widgetType === "image")
      .map((w) => w.url)
      .sort();
    expect(urls).toEqual([
      "https://wp.example/a.jpg",
      "https://wp.example/b.jpg",
    ]);
    expect(
      result.routes[0]?.conversion.report.nodes.filter(
        (n) => n.reasonCode === "asset-unresolved",
      ),
    ).toHaveLength(0);
  });

  it("16. security: convertProject throws if media enabled sync; no host fetch", async () => {
    expect(() =>
      convertProject(vfs({ ...basePkg, "src/main.tsx": "export default function A(){return null}" }), {
        media: { enabled: true },
      }),
    ).toThrow(/convertProjectAsync/);

    const client = mockClient(async (req) => {
      // Ensure only VFS bytes — no path traversal filenames
      expect(req.filename.includes("..")).toBe(false);
      expect(req.assetPath.includes("node_modules")).toBe(false);
      return {
        assetPath: req.assetPath,
        status: "uploaded" as const,
        url: "https://wp.example/ok.png",
      };
    });
    await convertProjectAsync(
      vfs({
        ...basePkg,
        "src/main.tsx": `
          import hero from "@/assets/ok.png";
          export default function App(){ return <img src={hero} alt="" />; }
        `,
        "src/assets/ok.png": "x",
      }),
      { media: { enabled: true, client } },
    );
  });

  it("17. API runProjectConvert media opt-in without multipart password", async () => {
    const zip = zipSync({
      "package.json": strToU8(
        JSON.stringify({
          dependencies: { react: "18.0.0" },
          devDependencies: { vite: "5.0.0" },
        }),
      ),
      "src/main.tsx": strToU8(
        `export default function App(){ return <h1>Hi</h1>; }`,
      ),
    });
    const off = await runProjectConvert(zip, { mediaEnabled: false });
    expect(off.status).toBe(200);
    if (off.payload.ok) {
      expect(off.payload.result.media).toBeUndefined();
    }

    // media enabled without env → failed with media-config-missing
    const prev = {
      url: process.env.N2E_WP_BASE_URL,
      user: process.env.N2E_WP_USER,
      pass: process.env.N2E_WP_APP_PASSWORD,
    };
    delete process.env.N2E_WP_BASE_URL;
    delete process.env.N2E_WP_USER;
    delete process.env.N2E_WP_APP_PASSWORD;
    try {
      const on = await runProjectConvert(zip, { mediaEnabled: true });
      expect(on.status).toBe(200);
      if (on.payload.ok) {
        expect(on.payload.result.outcome).toBe("failed");
        expect(
          on.payload.result.diagnostics.some(
            (d) => d.code === "media-config-missing",
          ),
        ).toBe(true);
        expect(on.payload.result.media?.enabled).toBe(true);
      }
    } finally {
      if (prev.url) process.env.N2E_WP_BASE_URL = prev.url;
      if (prev.user) process.env.N2E_WP_USER = prev.user;
      if (prev.pass) process.env.N2E_WP_APP_PASSWORD = prev.pass;
    }
  });
});
