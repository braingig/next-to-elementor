/**
 * Phase 13a — project ZIP → ProjectVirtualFS.
 * Does not exercise convertSource / section conversion.
 */

import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  classifyProjectFileBytes,
  detectSingleRootPrefix,
  extractProjectZip,
  matchIgnoredPath,
  normalizeZipEntryPath,
  normalizeVirtualPath,
  PROJECT_LIMITS,
  convertSource,
} from "@/lib/converter";

function zipFromFiles(files: Record<string, string | Uint8Array>): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    encoded[path] =
      typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(encoded, { level: 6 });
}

/** Minimal ZIP writer for adversarial names / Unix symlink attrs. */
function buildRawZip(
  entries: Array<{
    name: string;
    data: Uint8Array;
    /** Unix mode in high 16 bits of external attrs (e.g. 0o120755 symlink). */
    unixMode?: number;
    versionMadeBy?: number;
  }>,
): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const u16 = (n: number) => {
    const b = new Uint8Array(2);
    b[0] = n & 0xff;
    b[1] = (n >> 8) & 0xff;
    return b;
  };
  const u32 = (n: number) => {
    const b = new Uint8Array(4);
    b[0] = n & 0xff;
    b[1] = (n >> 8) & 0xff;
    b[2] = (n >> 16) & 0xff;
    b[3] = (n >> 24) & 0xff;
    return b;
  };
  const concat = (chunks: Uint8Array[]) => {
    const len = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  };

  for (const entry of entries) {
    const nameBytes = strToU8(entry.name);
    const data = entry.data;
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0), // store
      u16(0),
      u16(0),
      u32(0), // crc ignored for our parser path; fflate may validate — use 0 store carefully
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);

    // Recompute CRC32 for stored entries so fflate accepts inflate.
    // Simpler: only use buildRawZip for CD-reject cases that fail before inflate,
    // OR use compression method 0 with correct CRC.
    localParts.push(local);

    const madeBy = entry.versionMadeBy ?? (entry.unixMode != null ? 0x03ff : 20);
    const external =
      entry.unixMode != null ? (entry.unixMode & 0xffff) << 16 : 0;

    const central = concat([
      u32(0x02014b50),
      u16(madeBy),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(external),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += local.length;
  }

  const centralDir = concat(centralParts);
  const eocd = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return concat([...localParts, centralDir, eocd]);
}

describe("project Phase 13a: path helpers", () => {
  it("normalizes ZIP entry paths via shared virtual-path rules", () => {
    expect(normalizeZipEntryPath("src/App.tsx")).toBe("src/App.tsx");
    expect(normalizeZipEntryPath("./src/App.tsx")).toBe("src/App.tsx");
    expect(normalizeZipEntryPath("a/b/../c/./d.tsx")).toBe("a/c/d.tsx");
    expect(normalizeZipEntryPath("foo\\bar.tsx")).toBe("foo/bar.tsx");
    expect(normalizeZipEntryPath("src/")).toBe("src");
  });

  it("rejects traversal and absolute ZIP paths at normalize layer", () => {
    expect(normalizeZipEntryPath("../secret.tsx")).toBeNull();
    expect(normalizeZipEntryPath("/abs.tsx")).toBeNull();
    expect(normalizeVirtualPath("/abs.tsx")).toBeNull();
  });

  it("matches ignore segments without silencing ordinary source dirs", () => {
    expect(matchIgnoredPath("node_modules/lodash/index.js")).toMatch(
      /ignored-directory/,
    );
    expect(matchIgnoredPath("app/.next/cache")).toMatch(/ignored-directory/);
    expect(matchIgnoredPath("src/components/Button.tsx")).toBeNull();
    expect(matchIgnoredPath("app/page.tsx")).toBeNull();
  });

  it("detects a single root prefix for nested project folders", () => {
    expect(
      detectSingleRootPrefix([
        "my-app/package.json",
        "my-app/src/App.tsx",
      ]),
    ).toBe("my-app/");
    expect(
      detectSingleRootPrefix(["package.json", "src/App.tsx"]),
    ).toBeNull();
  });

  it("classifies text vs binary assets", () => {
    const text = classifyProjectFileBytes(
      "src/App.tsx",
      strToU8("export const App = () => <div/>;"),
    );
    expect(text.kind).toBe("text");
    if (text.kind === "text") {
      expect(text.content).toContain("App");
    }

    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 3]);
    const bin = classifyProjectFileBytes("public/logo.png", pngHeader);
    expect(bin.kind).toBe("binary");
    if (bin.kind === "binary") {
      expect(bin.extension).toBe(".png");
      expect(bin.bytes.byteLength).toBe(8);
    }
  });
});

describe("project Phase 13a: extractProjectZip", () => {
  it("extracts a valid ZIP into ProjectVirtualFS", () => {
    const zip = zipFromFiles({
      "package.json": '{"name":"demo"}',
      "src/App.tsx": "export const App = () => <h1>Hi</h1>;",
      "src/styles.css": "body { margin: 0; }",
    });

    const result = extractProjectZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.vfs.files["package.json"]?.kind).toBe("text");
    expect(result.vfs.files["src/App.tsx"]?.kind).toBe("text");
    expect(result.vfs.files["src/styles.css"]?.kind).toBe("text");
    expect(result.vfs.stats.fileCount).toBe(3);
    expect(result.vfs.stats.textFileCount).toBe(3);
    expect(result.vfs.limitsApplied.maxFiles).toBe(PROJECT_LIMITS.maxFiles);
  });

  it("strips a single nested project root folder", () => {
    const zip = zipFromFiles({
      "demo-main/package.json": '{"name":"demo"}',
      "demo-main/app/page.tsx": "export default function Page(){return <div/>}",
    });

    const result = extractProjectZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.vfs.stats.rootPrefixStripped).toBe("demo-main");
    expect(result.vfs.files["package.json"]).toBeDefined();
    expect(result.vfs.files["app/page.tsx"]).toBeDefined();
    expect(result.vfs.files["demo-main/package.json"]).toBeUndefined();
  });

  it("can disable root stripping", () => {
    const zip = zipFromFiles({
      "demo-main/package.json": '{"name":"demo"}',
    });
    const result = extractProjectZip(zip, { stripSingleRoot: false });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.vfs.files["demo-main/package.json"]).toBeDefined();
  });

  it("rejects path traversal entries", () => {
    const zip = buildRawZip([
      { name: "../escape.tsx", data: strToU8("export const X = 1;") },
    ]);
    const result = extractProjectZip(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("path-traversal");
  });

  it("rejects absolute path entries", () => {
    const zip = buildRawZip([
      { name: "/etc/passwd", data: strToU8("root:x") },
    ]);
    const result = extractProjectZip(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("absolute-path");
  });

  it("records ignored node_modules/.git/.next (and does not keep them as source)", () => {
    const zip = zipFromFiles({
      "package.json": '{"name":"demo"}',
      "src/App.tsx": "export const App = () => null;",
      "node_modules/lodash/index.js": "module.exports = {}",
      ".git/config": "[core]",
      ".next/cache/index": "x",
      "dist/bundle.js": "console.log(1)",
      "coverage/lcov.info": "TN:",
    });

    const result = extractProjectZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.vfs.files["package.json"]).toBeDefined();
    expect(result.vfs.files["src/App.tsx"]).toBeDefined();
    expect(result.vfs.files["node_modules/lodash/index.js"]).toBeUndefined();
    expect(result.vfs.files[".git/config"]).toBeUndefined();
    expect(result.vfs.files[".next/cache/index"]).toBeUndefined();
    expect(result.vfs.files["dist/bundle.js"]).toBeUndefined();
    expect(result.vfs.files["coverage/lcov.info"]).toBeUndefined();

    const ignoredPaths = result.vfs.ignored.map((i) => i.path);
    expect(ignoredPaths.some((p) => p.includes("node_modules"))).toBe(true);
    expect(ignoredPaths.some((p) => p.includes(".git"))).toBe(true);
    expect(ignoredPaths.some((p) => p.includes(".next"))).toBe(true);
    expect(result.vfs.stats.ignoredCount).toBeGreaterThan(0);
  });

  it("enforces file-count limit on kept files", () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 5; i++) {
      files[`f${i}.tsx`] = `export const F${i} = () => null;`;
    }
    const zip = zipFromFiles(files);
    const result = extractProjectZip(zip, { limits: { maxFiles: 3 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("file-count-limit");
  });

  it("enforces uncompressed-size limit", () => {
    const zip = zipFromFiles({
      "big.txt": "a".repeat(5000),
    });
    const result = extractProjectZip(zip, {
      limits: { maxUncompressedBytes: 1000, maxFileBytes: 10_000 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("uncompressed-size-limit");
  });

  it("enforces individual source file size limit", () => {
    const zip = zipFromFiles({
      "huge.tsx": "x".repeat(2000),
    });
    const result = extractProjectZip(zip, {
      limits: { maxFileBytes: 500, maxUncompressedBytes: 50_000 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("file-byte-limit");
  });

  it("enforces zip size limit", () => {
    const zip = zipFromFiles({
      "a.tsx": "export const A = 1;",
    });
    const result = extractProjectZip(zip, { limits: { maxZipBytes: 10 } });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("zip-size-limit");
  });

  it("rejects suspicious compression ratios", () => {
    // Highly compressible payload → high uncompressed/zip ratio.
    const zeros = new Uint8Array(200_000);
    const zip = zipSync({ "bomb.txt": zeros }, { level: 9 });
    const result = extractProjectZip(zip, {
      limits: {
        maxCompressionRatio: 5,
        maxUncompressedBytes: 5_000_000,
        maxFileBytes: 5_000_000,
        maxZipBytes: 5_000_000,
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("compression-ratio-limit");
  });

  it("rejects malformed ZIP buffers", () => {
    const result = extractProjectZip(strToU8("not-a-zip"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("malformed-zip");
  });

  it("rejects empty ZIP buffer", () => {
    const result = extractProjectZip(new Uint8Array());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("empty-zip");
  });

  it("keeps binary assets as binary metadata (not source text)", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const zip = zipFromFiles({
      "package.json": "{}",
      "public/logo.png": png,
    });
    const result = extractProjectZip(zip);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const logo = result.vfs.files["public/logo.png"];
    expect(logo?.kind).toBe("binary");
    if (logo?.kind === "binary") {
      expect(logo.bytes[0]).toBe(0x89);
      expect(logo.extension).toBe(".png");
    }
    expect(result.vfs.stats.binaryFileCount).toBe(1);
    expect(result.vfs.stats.textFileCount).toBe(1);
  });

  it("rejects Unix symlink entries before inflate", () => {
    const zip = buildRawZip([
      {
        name: "link-to-secret",
        data: strToU8("../secret"),
        unixMode: 0o120755,
        versionMadeBy: 0x03ff,
      },
    ]);
    const result = extractProjectZip(zip);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("symlink-rejected");
  });

  it("does not break existing convertSource section conversion", () => {
    const result = convertSource({
      source: `export function Hero(){ return <h1 className="text-xl">Hi</h1>; }`,
      language: "tsx",
      css: "",
    });
    expect(result.outcome === "complete" || result.outcome === "partial").toBe(
      true,
    );
    expect(result.elementorJson).not.toBeNull();
  });
});
