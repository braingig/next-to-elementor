/**
 * Phase 14d — safe image optimization before WordPress media upload.
 */

import { describe, expect, it, afterEach } from "vitest";
import sharp from "sharp";
import {
  convertProject,
  convertProjectAsync,
  createProjectVirtualFSFromTextFiles,
  optimizeAsset,
  runProjectMediaPipeline,
  resetSharpCacheForTests,
  type AssetOptimizationResult,
  type ProjectAsset,
  type ProjectMediaClient,
  type ProjectMediaUploadRequest,
  type ProjectMediaUploadResult,
  type ProjectVirtualFS,
} from "@/lib/converter";
import { PROJECT_LIMITS } from "@/lib/converter/project/limits";

function mockClient(
  impl?: (
    req: ProjectMediaUploadRequest,
  ) => Promise<ProjectMediaUploadResult> | ProjectMediaUploadResult,
): ProjectMediaClient & { calls: ProjectMediaUploadRequest[] } {
  const calls: ProjectMediaUploadRequest[] = [];
  return {
    calls,
    async upload(req) {
      calls.push(req);
      if (impl) return await impl(req);
      return {
        assetPath: req.assetPath,
        status: "uploaded",
        url: `https://wp.example/wp-content/uploads/${req.filename}`,
        attachmentId: String(calls.length),
      };
    },
  };
}

function vfsWithBinaries(
  text: Record<string, string>,
  binaries: Record<string, Uint8Array>,
): ProjectVirtualFS {
  const base = createProjectVirtualFSFromTextFiles(text);
  for (const [path, bytes] of Object.entries(binaries)) {
    const extension = path.includes(".")
      ? path.slice(path.lastIndexOf(".")).toLowerCase()
      : "";
    base.files[path] = {
      path,
      kind: "binary",
      bytes,
      byteLength: bytes.byteLength,
      extension,
    };
    base.stats.binaryFileCount += 1;
    base.stats.fileCount += 1;
    base.stats.uncompressedBytes += bytes.byteLength;
  }
  return base;
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

function presentAsset(
  path: string,
  extension: string,
  size = 1,
): ProjectAsset {
  return {
    path,
    kind: "image",
    size,
    presence: "present",
    extension,
  };
}

async function noisyJpeg(width: number, height: number, quality = 95): Promise<Uint8Array> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = (i * 37 + (i % 251)) & 255;
  }
  const buf = await sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality, mozjpeg: false })
    .toBuffer();
  return new Uint8Array(buf);
}

async function solidPng(
  width: number,
  height: number,
  rgba: { r: number; g: number; b: number; alpha: number },
): Promise<Uint8Array> {
  const buf = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: rgba,
    },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  return new Uint8Array(buf);
}

async function noisyWebp(width: number, height: number): Promise<Uint8Array> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 91) & 255;
  const buf = await sharp(raw, { raw: { width, height, channels: 3 } })
    .webp({ quality: 95 })
    .toBuffer();
  return new Uint8Array(buf);
}

/** Minimal valid 1×1 GIF. */
const TINY_GIF = Uint8Array.from([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x21, 0xf9, 0x04, 0x01, 0x00, 0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4c, 0x01, 0x00, 0x3b,
]);

afterEach(() => {
  resetSharpCacheForTests();
  delete process.env.N2E_MEDIA_OPTIMIZE;
});

describe("Phase 14d: optimizeAsset unit", () => {
  it("1. JPEG optimization can produce smaller bytes", async () => {
    const bytes = await noisyJpeg(320, 240);
    const result = await optimizeAsset({
      assetPath: "a.jpg",
      extension: ".jpg",
      bytes,
    });
    expect(result.originalBytes).toBe(bytes.byteLength);
    expect(["optimized", "original-smaller-or-equal"]).toContain(
      result.optimizationStatus,
    );
    if (result.optimizationStatus === "optimized") {
      expect(result.bytes.byteLength).toBeLessThan(bytes.byteLength);
      expect(result.optimizedBytes).toBe(result.bytes.byteLength);
      expect(result.optimizer).toMatch(/^sharp/);
    } else {
      expect(result.bytes).toBe(bytes);
    }
  });

  it("2. PNG optimization preserves alpha", async () => {
    const bytes = await solidPng(64, 64, { r: 255, g: 0, b: 0, alpha: 0.4 });
    const result = await optimizeAsset({
      assetPath: "a.png",
      extension: ".png",
      bytes,
    });
    expect(result.optimizationStatus).not.toBe("fallback");
    const meta = await sharp(Buffer.from(result.bytes)).metadata();
    expect(meta.hasAlpha).toBe(true);
    const { data } = await sharp(Buffer.from(result.bytes))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Sample center pixel alpha channel
    const alpha = data[3];
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
  });

  it("3. WebP stays WebP", async () => {
    const bytes = await noisyWebp(160, 120);
    const result = await optimizeAsset({
      assetPath: "a.webp",
      extension: ".webp",
      bytes,
    });
    const meta = await sharp(Buffer.from(result.bytes)).metadata();
    expect(meta.format).toBe("webp");
    expect(["optimized", "original-smaller-or-equal"]).toContain(
      result.optimizationStatus,
    );
  });

  it("4. original-smaller-or-equal retains original bytes", async () => {
    const bytes = await solidPng(8, 8, { r: 0, g: 0, b: 0, alpha: 1 });
    // Highly compressible already; force a larger "optimized" via inject is in pipeline tests.
    // Here: if sharp doesn't shrink, status must retain original reference equality.
    const result = await optimizeAsset({
      assetPath: "tiny.png",
      extension: ".png",
      bytes,
    });
    if (result.optimizationStatus === "original-smaller-or-equal") {
      expect(result.bytes).toBe(bytes);
      expect(result.fallbackReason).toBe("original-smaller-or-equal");
    }
  });

  it("5. invalid/corrupt image → fallback to original", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 4, 5]);
    const result = await optimizeAsset({
      assetPath: "bad.jpg",
      extension: ".jpg",
      bytes,
    });
    expect(result.optimizationStatus).toBe("fallback");
    expect(result.fallbackReason).toBe("optimize-failed");
    expect(result.bytes).toBe(bytes);
  });

  it("6. GIF skipped", async () => {
    const result = await optimizeAsset({
      assetPath: "a.gif",
      extension: ".gif",
      bytes: TINY_GIF,
    });
    expect(result.optimizationStatus).toBe("skipped");
    expect(result.fallbackReason).toBe("format-gif");
    expect(result.bytes).toBe(TINY_GIF);
  });

  it("7. sharp unavailable → fallback", async () => {
    const bytes = await noisyJpeg(64, 64);
    const result = await optimizeAsset({
      assetPath: "a.jpg",
      extension: ".jpg",
      bytes,
      loadSharp: async () => null,
    });
    expect(result.optimizationStatus).toBe("fallback");
    expect(result.fallbackReason).toBe("sharp-unavailable");
    expect(result.bytes).toBe(bytes);
  });

  it("8. >4096 longest edge is downscaled", async () => {
    const bytes = await noisyJpeg(5000, 100, 90);
    const result = await optimizeAsset({
      assetPath: "wide.jpg",
      extension: ".jpg",
      bytes,
    });
    const meta = await sharp(Buffer.from(result.bytes)).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(
      4096,
    );
  });

  it("9. >~16MP is downscaled", async () => {
    // 5000×4000 = 20MP solid JPEG (small file, large decode).
    const buf = await sharp({
      create: {
        width: 5000,
        height: 4000,
        channels: 3,
        background: { r: 40, g: 80, b: 120 },
      },
    })
      .jpeg({ quality: 85 })
      .toBuffer();
    const bytes = new Uint8Array(buf);
    const result = await optimizeAsset({
      assetPath: "huge.jpg",
      extension: ".jpg",
      bytes,
    });
    const meta = await sharp(Buffer.from(result.bytes)).metadata();
    const pixels = (meta.width ?? 0) * (meta.height ?? 0);
    expect(pixels).toBeLessThanOrEqual(16_000_000);
  });

  it("10. under limits keeps dimensions", async () => {
    const bytes = await noisyJpeg(120, 80);
    const before = await sharp(Buffer.from(bytes)).metadata();
    const result = await optimizeAsset({
      assetPath: "small.jpg",
      extension: ".jpg",
      bytes,
    });
    const after = await sharp(Buffer.from(result.bytes)).metadata();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
  });

  it("11. optimize-disabled skip", async () => {
    const bytes = await noisyJpeg(64, 64);
    const result = await optimizeAsset({
      assetPath: "a.jpg",
      extension: ".jpg",
      bytes,
      enabled: false,
    });
    expect(result.optimizationStatus).toBe("skipped");
    expect(result.fallbackReason).toBe("optimize-disabled");
    expect(result.bytes).toBe(bytes);
  });
});

describe("Phase 14d: media pipeline integration", () => {
  it("12. PNG/JPEG/WebP pipeline uploads optimized or original; VFS unchanged", async () => {
    const jpeg = await noisyJpeg(200, 150);
    const png = await solidPng(80, 80, { r: 0, g: 128, b: 255, alpha: 0.5 });
    const webp = await noisyWebp(100, 80);
    const vfs = vfsWithBinaries(
      {
        ...basePkg,
        "src/main.tsx": `export default function App(){ return <div/> }`,
      },
      {
        "src/assets/a.jpg": jpeg,
        "src/assets/b.png": png,
        "src/assets/c.webp": webp,
      },
    );
    const jpegBefore = vfs.files["src/assets/a.jpg"]!;
    expect(jpegBefore.kind).toBe("binary");
    const origRef =
      jpegBefore.kind === "binary" ? jpegBefore.bytes : new Uint8Array();

    const client = mockClient();
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [
        presentAsset("src/assets/a.jpg", ".jpg"),
        presentAsset("src/assets/b.png", ".png"),
        presentAsset("src/assets/c.webp", ".webp"),
      ],
      options: { enabled: true, client, optimize: true },
    });

    expect(pipeline.ok).toBe(true);
    expect(client.calls).toHaveLength(3);
    expect(pipeline.summary.uploadedCount).toBe(3);
    for (const u of pipeline.summary.uploads) {
      expect(u.optimization).toBeDefined();
      expect(["optimized", "original-smaller-or-equal", "fallback", "skipped"]).toContain(
        u.optimization!.optimizationStatus,
      );
    }
    // VFS bytes identity unchanged
    const after = vfs.files["src/assets/a.jpg"];
    expect(after?.kind).toBe("binary");
    if (after?.kind === "binary") {
      expect(after.bytes).toBe(origRef);
      expect(after.bytes.byteLength).toBe(jpeg.byteLength);
    }
  });

  it("13. optimized retained only when strictly smaller", async () => {
    const original = await noisyJpeg(180, 120);
    const client = mockClient();
    let calls = 0;
    const optimizeFn = async (): Promise<AssetOptimizationResult> => {
      calls += 1;
      const smaller = original.slice(0, Math.max(1, original.byteLength - 50));
      return {
        bytes: smaller,
        originalBytes: original.byteLength,
        optimizedBytes: smaller.byteLength,
        savingsBytes: original.byteLength - smaller.byteLength,
        savingsPercent: 10,
        optimizer: "test",
        optimizationStatus: "optimized",
      };
    };
    const vfs = vfsWithBinaries(basePkg, { "src/a.jpg": original });
    await runProjectMediaPipeline({
      vfs,
      assets: [presentAsset("src/a.jpg", ".jpg")],
      options: { enabled: true, client, optimizeAsset: optimizeFn },
    });
    expect(calls).toBe(1);
    expect(client.calls[0]!.bytes.byteLength).toBeLessThan(original.byteLength);
  });

  it("14. larger-or-equal candidate keeps original (via optimizeFn)", async () => {
    const original = await noisyJpeg(64, 64);
    const client = mockClient();
    const bigger = new Uint8Array(original.byteLength + 100);
    bigger.set(original);
    const vfs = vfsWithBinaries(basePkg, { "src/a.jpg": original });
    await runProjectMediaPipeline({
      vfs,
      assets: [presentAsset("src/a.jpg", ".jpg")],
      options: {
        enabled: true,
        client,
        optimizeAsset: async () => ({
          bytes: original,
          originalBytes: original.byteLength,
          optimizedBytes: bigger.byteLength,
          savingsBytes: 0,
          savingsPercent: 0,
          optimizer: "test",
          optimizationStatus: "original-smaller-or-equal",
          fallbackReason: "original-smaller-or-equal",
        }),
      },
    });
    expect(client.calls[0]!.bytes).toBe(original);
  });

  it("15. GIF uploads original; optimize skipped", async () => {
    const client = mockClient();
    const vfs = vfsWithBinaries(basePkg, { "src/a.gif": TINY_GIF });
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [presentAsset("src/a.gif", ".gif")],
      options: { enabled: true, client, optimize: true },
    });
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.bytes).toBe(TINY_GIF);
    expect(pipeline.summary.uploads[0]!.optimization?.optimizationStatus).toBe(
      "skipped",
    );
    expect(pipeline.summary.uploads[0]!.optimization?.fallbackReason).toBe(
      "format-gif",
    );
  });

  it("16. SVG remains svg-upload-disabled (no upload)", async () => {
    const client = mockClient();
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');
    const vfs = createProjectVirtualFSFromTextFiles({
      ...basePkg,
      "src/icon.svg": new TextDecoder().decode(svg),
    });
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [presentAsset("src/icon.svg", ".svg")],
      options: { enabled: true, client, optimize: true },
    });
    expect(client.calls).toHaveLength(0);
    expect(pipeline.summary.uploads[0]!.status).toBe("skipped");
    expect(pipeline.summary.uploads[0]!.skipReason).toBe("svg-upload-disabled");
  });

  it("17. sharp unavailable does not fail project; uploads original", async () => {
    const original = await noisyJpeg(80, 60);
    const client = mockClient();
    const vfs = vfsWithBinaries(basePkg, { "src/a.jpg": original });
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [presentAsset("src/a.jpg", ".jpg")],
      options: {
        enabled: true,
        client,
        optimizeAsset: async (opts) =>
          optimizeAsset({ ...opts, loadSharp: async () => null }),
      },
    });
    expect(pipeline.ok).toBe(true);
    expect(client.calls[0]!.bytes).toBe(original);
    expect(pipeline.summary.uploads[0]!.optimization?.fallbackReason).toBe(
      "sharp-unavailable",
    );
    expect(
      pipeline.diagnostics.some((d) => d.code === "media-optimize-fallback"),
    ).toBe(true);
  });

  it("18. optimize once per assetPath; reuse copies optimization meta", async () => {
    const original = await noisyJpeg(100, 80);
    const client = mockClient();
    let optimizeCalls = 0;
    const vfs = vfsWithBinaries(basePkg, { "src/a.jpg": original });
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [
        presentAsset("src/a.jpg", ".jpg"),
        presentAsset("src/a.jpg", ".jpg"),
      ],
      options: {
        enabled: true,
        client,
        optimizeAsset: async (opts) => {
          optimizeCalls += 1;
          return optimizeAsset(opts);
        },
      },
    });
    expect(optimizeCalls).toBe(1);
    expect(client.calls).toHaveLength(1);
    expect(pipeline.summary.uploadedCount).toBe(1);
    expect(pipeline.summary.reusedCount).toBe(1);
    expect(pipeline.summary.uploads[1]!.status).toBe("reused");
    expect(pipeline.summary.uploads[1]!.optimization).toEqual(
      pipeline.summary.uploads[0]!.optimization,
    );
  });

  it("19. N2E_MEDIA_OPTIMIZE=0 disables optimization", async () => {
    process.env.N2E_MEDIA_OPTIMIZE = "0";
    const original = await noisyJpeg(120, 90);
    const client = mockClient();
    const vfs = vfsWithBinaries(basePkg, { "src/a.jpg": original });
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [presentAsset("src/a.jpg", ".jpg")],
      options: { enabled: true, client },
    });
    expect(client.calls[0]!.bytes).toBe(original);
    expect(pipeline.summary.uploads[0]!.optimization?.optimizationStatus).toBe(
      "skipped",
    );
    expect(pipeline.summary.uploads[0]!.optimization?.fallbackReason).toBe(
      "optimize-disabled",
    );
  });

  it("20. Media OFF: no optimize, no upload", async () => {
    const client = mockClient();
    let optimizeCalls = 0;
    const result = convertProject(
      vfsWithBinaries(
        {
          ...basePkg,
          "src/main.tsx": `
            import hero from "@/assets/hero.jpg";
            export default function App(){ return <img src={hero} alt="" />; }
          `,
        },
        { "src/assets/hero.jpg": await noisyJpeg(40, 30) },
      ),
    );
    expect(result.media).toBeUndefined();

    const asyncOff = await convertProjectAsync(
      vfsWithBinaries(
        {
          ...basePkg,
          "src/main.tsx": `
            import hero from "@/assets/hero.jpg";
            export default function App(){ return <img src={hero} alt="" />; }
          `,
        },
        { "src/assets/hero.jpg": await noisyJpeg(40, 30) },
      ),
      {
        media: {
          enabled: false,
          client,
          optimizeAsset: async (o) => {
            optimizeCalls += 1;
            return optimizeAsset(o);
          },
        },
      },
    );
    expect(asyncOff.media).toBeUndefined();
    expect(client.calls).toHaveLength(0);
    expect(optimizeCalls).toBe(0);
  });

  it("21. Media ON: 14c URL rewrite still works with optimize", async () => {
    const jpeg = await noisyJpeg(100, 80);
    const client = mockClient(async (req) => ({
      assetPath: req.assetPath,
      status: "uploaded" as const,
      url: "https://wp.example/wp-content/uploads/hero.jpg",
    }));
    const result = await convertProjectAsync(
      vfsWithBinaries(
        {
          ...basePkg,
          "src/main.tsx": `
            import hero from "@/assets/hero.jpg";
            export default function App(){ return <img src={hero} alt="Hero" />; }
          `,
        },
        { "src/assets/hero.jpg": jpeg },
      ),
      { media: { enabled: true, client, optimize: true } },
    );
    expect(result.media?.uploadedCount).toBe(1);
    expect(client.calls).toHaveLength(1);
    const walk = (node: unknown): string[] => {
      if (!node || typeof node !== "object") return [];
      const n = node as {
        widgetType?: string;
        settings?: { image?: { url?: string } };
        elements?: unknown[];
        content?: unknown[];
      };
      const urls: string[] = [];
      if (n.widgetType === "image" && n.settings?.image?.url) {
        urls.push(n.settings.image.url);
      }
      for (const c of n.elements ?? n.content ?? []) urls.push(...walk(c));
      return urls;
    };
    const urls = result.routes.flatMap((r) =>
      walk(r.conversion.document ?? r.conversion.elementorDocument),
    );
    // document shape may vary — also check report / IR via settings in conversion
    const doc = result.routes[0]?.conversion;
    const raw = JSON.stringify(doc);
    expect(raw).toContain("https://wp.example/wp-content/uploads/hero.jpg");
    expect(urls.length === 0 || urls.includes("https://wp.example/wp-content/uploads/hero.jpg")).toBe(
      true,
    );
  });

  it("22. optimization failure must not fail whole project", async () => {
    const original = await noisyJpeg(50, 40);
    const client = mockClient();
    const vfs = vfsWithBinaries(basePkg, { "src/a.jpg": original });
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [presentAsset("src/a.jpg", ".jpg")],
      options: {
        enabled: true,
        client,
        optimizeAsset: async () => {
          throw new Error("boom");
        },
      },
    });
    expect(pipeline.ok).toBe(true);
    expect(pipeline.summary.uploadedCount).toBe(1);
    expect(client.calls[0]!.bytes).toBe(original);
    expect(pipeline.summary.uploads[0]!.optimization?.fallbackReason).toBe(
      "optimize-failed",
    );
  });

  it("22b. corrupt image optimize fallback does not fail pipeline", async () => {
    const corrupt = new Uint8Array([0xff, 0xd8, 0x00]);
    const client = mockClient();
    const vfs = vfsWithBinaries(basePkg, { "src/a.jpg": corrupt });
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [presentAsset("src/a.jpg", ".jpg")],
      options: { enabled: true, client, optimize: true },
    });
    expect(pipeline.ok).toBe(true);
    expect(pipeline.summary.uploadedCount).toBe(1);
    expect(client.calls[0]!.bytes).toBe(corrupt);
    expect(pipeline.summary.uploads[0]!.optimization?.optimizationStatus).toBe(
      "fallback",
    );
  });

  it("23. soft-skipped 14a asset is not optimized/uploaded", async () => {
    const client = mockClient();
    let optimizeCalls = 0;
    const vfs = createProjectVirtualFSFromTextFiles(basePkg);
    const pipeline = await runProjectMediaPipeline({
      vfs,
      assets: [
        {
          path: "src/big.jpg",
          kind: "image",
          size: PROJECT_LIMITS.maxBinaryAssetBytes + 1,
          extension: ".jpg",
          presence: "skipped",
          skipReason: "asset-file-byte-limit",
        },
      ],
      options: {
        enabled: true,
        client,
        optimizeAsset: async (o) => {
          optimizeCalls += 1;
          return optimizeAsset(o);
        },
      },
    });
    expect(client.calls).toHaveLength(0);
    expect(optimizeCalls).toBe(0);
    expect(pipeline.summary.uploads[0]!.status).toBe("skipped");
    expect(pipeline.summary.uploads[0]!.skipReason).toBe(
      "asset-file-byte-limit",
    );
    expect(pipeline.summary.uploads[0]!.optimization?.fallbackReason).toBe(
      "asset-admission-skipped",
    );
  });
});
