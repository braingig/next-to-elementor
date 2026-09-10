/**
 * Shared helpers for Phase 13f project fixtures.
 * Load on-disk fixture trees → VFS / ZIP → convert/assert Free 4.2.4 docs.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import {
  convertProject,
  createProjectVirtualFSFromTextFiles,
  extractProjectZip,
  loadElementorFreeCatalog,
  PROJECT_LIMITS,
  SECTION_INPUT_LIMITS,
  validateElementorDocument,
  type ElementorDocument,
  type ElementorElement,
  type ProjectConversionResult,
  type ProjectVirtualFS,
} from "@/lib/converter";

export const PROJECT_FIXTURES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
);

export const catalog = loadElementorFreeCatalog("4.2.4");

/** Recursively load a fixture directory into a path → utf8 (or binary) map. */
export function loadFixtureFiles(
  fixtureName: string,
): Record<string, string | Uint8Array> {
  const dir = join(PROJECT_FIXTURES_ROOT, fixtureName);
  if (!existsSync(dir)) {
    throw new Error(`Missing project fixture directory: ${fixtureName}`);
  }
  const files: Record<string, string | Uint8Array> = {};

  function walk(current: string) {
    for (const name of readdirSync(current)) {
      if (name === "README.md" || name === "meta.json") continue;
      const abs = join(current, name);
      const rel = relative(dir, abs).replace(/\\/g, "/");
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (/\.(png|jpe?g|gif|webp|ico)$/i.test(name)) {
        files[rel] = new Uint8Array(readFileSync(abs));
      } else {
        files[rel] = readFileSync(abs, "utf8");
      }
    }
  }

  walk(dir);
  return files;
}

export function loadFixtureTextFiles(
  fixtureName: string,
): Record<string, string> {
  const raw = loadFixtureFiles(fixtureName);
  const out: Record<string, string> = {};
  for (const [path, content] of Object.entries(raw)) {
    if (typeof content === "string") out[path] = content;
  }
  return out;
}

export function vfsFromFixture(fixtureName: string): ProjectVirtualFS {
  return createProjectVirtualFSFromTextFiles(loadFixtureTextFiles(fixtureName));
}

export function zipFromFiles(
  files: Record<string, string | Uint8Array>,
): Uint8Array {
  const encoded: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(files)) {
    encoded[path] =
      typeof content === "string" ? strToU8(content) : content;
  }
  return zipSync(encoded, { level: 6 });
}

export function zipFromFixture(fixtureName: string): Uint8Array {
  return zipFromFiles(loadFixtureFiles(fixtureName));
}

export function convertFixture(fixtureName: string): ProjectConversionResult {
  return convertProject(vfsFromFixture(fixtureName));
}

export function convertFixtureZip(fixtureName: string): ProjectConversionResult {
  const extracted = extractProjectZip(zipFromFixture(fixtureName));
  if (!extracted.ok) {
    throw new Error(
      `Fixture ZIP extract failed (${fixtureName}): ${extracted.error.code} ${extracted.error.message}`,
    );
  }
  return convertProject(extracted.vfs);
}

export function assertValidFreeDocument(
  json: unknown,
  expectFn: typeof import("vitest").expect,
): asserts json is ElementorDocument {
  expectFn(json).not.toBeNull();
  const doc = json as ElementorDocument;
  expectFn(doc.version).toBe("0.4");
  const validation = validateElementorDocument(doc, catalog);
  expectFn(validation.passed).toBe(true);
  assertContainerOnlyWith(doc.content, expectFn);
}

function assertContainerOnlyWith(
  elements: ElementorElement[],
  expectFn: typeof import("vitest").expect,
): void {
  const stack = [...elements];
  while (stack.length) {
    const el = stack.pop()!;
    expectFn(el.elType === "container" || el.elType === "widget").toBe(true);
    expectFn(el.elType).not.toBe("section");
    expectFn(el.elType).not.toBe("column");
    if (el.elType === "widget") {
      expectFn(typeof el.widgetType).toBe("string");
      expectFn(el.widgetType).not.toMatch(/pro/i);
    }
    if (Array.isArray(el.elements)) {
      stack.push(...el.elements);
    }
  }
}

export function routeByPath(
  result: ProjectConversionResult,
  path: string,
) {
  return result.routes.find((r) => r.route.path === path);
}

export function usableRouteCount(result: ProjectConversionResult): number {
  return result.routes.filter((r) => r.conversion.elementorJson != null).length;
}

export function assertIndependentDocuments(
  result: ProjectConversionResult,
  expectFn: typeof import("vitest").expect,
): void {
  const docs = result.routes
    .map((r) => r.conversion.elementorJson)
    .filter((d) => d != null);
  expectFn(docs.length).toBeGreaterThan(1);
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      expectFn(docs[i]).not.toBe(docs[j]);
    }
  }
}

export function assertProjectLimitsSeparateFromSection(
  expectFn: typeof import("vitest").expect,
): void {
  expectFn(PROJECT_LIMITS.maxFiles).toBeGreaterThan(SECTION_INPUT_LIMITS.maxFiles);
  expectFn(PROJECT_LIMITS.maxFileBytes).toBeGreaterThan(
    SECTION_INPUT_LIMITS.maxFileBytes,
  );
  expectFn(PROJECT_LIMITS.maxZipBytes).toBeGreaterThan(0);
  expectFn(PROJECT_LIMITS.maxArchiveEntries).toBeGreaterThan(
    PROJECT_LIMITS.maxFiles,
  );
}

/**
 * Minimal ZIP writer for adversarial CD flags (encryption, etc.).
 */
export function buildRawZip(
  entries: Array<{
    name: string;
    data: Uint8Array;
    unixMode?: number;
    versionMadeBy?: number;
    generalPurposeBitFlag?: number;
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
    const gp = entry.generalPurposeBitFlag ?? 0;
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(gp),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    localParts.push(local);

    const madeBy =
      entry.versionMadeBy ?? (entry.unixMode != null ? 0x03ff : 20);
    const external =
      entry.unixMode != null ? (entry.unixMode & 0xffff) << 16 : 0;

    const central = concat([
      u32(0x02014b50),
      u16(madeBy),
      u16(20),
      u16(gp),
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

export { PROJECT_LIMITS, SECTION_INPUT_LIMITS, strToU8, zipSync };
