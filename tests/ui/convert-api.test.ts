import { describe, expect, it } from "vitest";
import {
  MAX_CONVERT_BODY_BYTES,
  collectCssFromVirtualFiles,
  estimateJsonBodyBytes,
  runConvertRequest,
} from "@/app/lib/server-convert";
import { SECTION_INPUT_LIMITS } from "@/lib/converter";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REALWORLD = join(
  dirname(fileURLToPath(import.meta.url)),
  "../converter/fixtures/section-input/RealWorldSection",
);

function loadFixtureMap(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  function walk(current: string) {
    for (const name of readdirSync(current)) {
      const abs = join(current, name);
      const rel = relative(dir, abs).replace(/\\/g, "/");
      if (statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (/\.(tsx|ts|jsx|js|css)$/i.test(name)) {
        files[rel] = readFileSync(abs, "utf8");
      }
    }
  }
  walk(dir);
  return files;
}

describe("POST /api/convert handler (runConvertRequest)", () => {
  it("rejects empty / invalid bodies with 400", () => {
    expect(runConvertRequest({}).status).toBe(400);
    expect(runConvertRequest({ source: "" }).status).toBe(400);
    expect(runConvertRequest({ source: "ok", extra: true }).status).toBe(400);
    const bad = runConvertRequest({ source: "" });
    expect(bad.payload.ok).toBe(false);
  });

  it("rejects mutually exclusive source + files", () => {
    const { status, payload } = runConvertRequest({
      source: "export const A = () => <h1/>;",
      files: { "A.tsx": "export const A = () => <h1/>;" },
    });
    expect(status).toBe(400);
    expect(payload.ok).toBe(false);
    if (!payload.ok) {
      expect(payload.code).toBe("mutually-exclusive-modes");
    }
  });

  it("converts a simple heading to Elementor JSON (single-file)", () => {
    const { status, payload } = runConvertRequest({
      source: `export function Hero() {
  return <h1 className="text-xl font-bold">Hello</h1>;
}`,
      language: "tsx",
      title: "ui-test-hero",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(["complete", "partial"]).toContain(payload.result.outcome);
    expect(payload.result.elementorJson).not.toBeNull();
    expect(payload.result.elementorTarget).toBe("4.2.4");
    const doc = payload.result.elementorJson as {
      version: string;
      content: unknown[];
    };
    expect(doc.version).toBe("0.4");
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it("returns failed ConversionResult for unparseable source (HTTP 200)", () => {
    const { status, payload } = runConvertRequest({
      source: "export function Broken( { return <<<<<<<; }",
      language: "tsx",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.outcome).toBe("failed");
    expect(payload.result.elementorJson).toBeNull();
    expect(payload.result.report.diagnostics.length).toBeGreaterThan(0);
  });

  it("surfaces unsupported nodes in partial reports", () => {
    const { status, payload } = runConvertRequest({
      source: `export function Mixed() {
  return (
    <div>
      <h2>Ok</h2>
      <FancyThing />
    </div>
  );
}`,
      language: "tsx",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(payload.result.outcome).toBe("partial");
    expect(
      payload.result.report.nodes.some((n) => n.decision === "unsupported"),
    ).toBe(true);
    expect(payload.result.elementorJson).not.toBeNull();
  });

  it("enforces body size constant for route protection", () => {
    expect(MAX_CONVERT_BODY_BYTES).toBe(512 * 1024);
    expect(estimateJsonBodyBytes("abc")).toBe(3);
  });

  it("folder POST resolves a simple multi-file section", () => {
    const { status, payload } = runConvertRequest({
      files: {
        "Hero.tsx": `import Content from "./Content";
export default function Hero() {
  return <section><Content /></section>;
}`,
        "Content.tsx": `export default function Content() {
  return <h1>From Content</h1>;
}`,
      },
      entryPath: "Hero.tsx",
      title: "folder-simple",
      language: "tsx",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(["complete", "partial"]).toContain(payload.result.outcome);
    expect(payload.result.elementorJson).not.toBeNull();
    expect(JSON.stringify(payload.result.elementorJson)).toContain(
      "From Content",
    );
    const doc = payload.result.elementorJson as { version: string };
    expect(doc.version).toBe("0.4");
  });

  it("folder POST resolves nested local components (RealWorldSection)", () => {
    const files = loadFixtureMap(REALWORLD);
    const { status, payload } = runConvertRequest({
      files,
      sectionName: "RealWorldSection",
      title: "RealWorldSection",
      language: "tsx",
    });
    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    if (!payload.ok) return;
    expect(["complete", "partial"]).toContain(payload.result.outcome);
    expect(payload.result.elementorJson).not.toBeNull();
    const html = JSON.stringify(payload.result.elementorJson);
    expect(html).toContain("Ship landing sections without rebuilding layouts");
    expect(html).toContain("Start converting");
    expect(html).toContain("Fast setup");
    expect(html).toContain("Reliable output");
    expect(html).toContain("Responsive design");
    expect(payload.result.report.summary.unsupportedCount).toBe(0);
    expect(
      payload.result.report.diagnostics.some((d) => d.code === "unknown-component"),
    ).toBe(false);
  });

  it("folder missing dependency returns clear 400 error", () => {
    const { status, payload } = runConvertRequest({
      files: {
        "Hero.tsx": `import Missing from "./Missing";
export default function Hero() { return <Missing />; }`,
      },
      entryPath: "Hero.tsx",
    });
    expect(status).toBe(400);
    expect(payload.ok).toBe(false);
    if (!payload.ok) {
      expect(payload.code).toBe("missing-dependency");
      expect(payload.error).toMatch(/Missing/);
    }
  });

  it("folder circular dependency returns clear 400 error", () => {
    const { status, payload } = runConvertRequest({
      files: {
        "A.tsx": `import B from "./B";
export default function A() { return <B />; }`,
        "B.tsx": `import A from "./A";
export default function B() { return <A />; }`,
      },
      entryPath: "A.tsx",
    });
    expect(status).toBe(400);
    expect(payload.ok).toBe(false);
    if (!payload.ok) {
      expect(payload.code).toBe("circular-dependency");
      expect(payload.error).toMatch(/A\.tsx → B\.tsx → A\.tsx/);
    }
  });

  it("folder ambiguous entry returns clear 400 error", () => {
    const { status, payload } = runConvertRequest({
      files: {
        "A.tsx": `export default function A() { return <h1>A</h1>; }`,
        "B.tsx": `export default function B() { return <h1>B</h1>; }`,
      },
    });
    expect(status).toBe(400);
    expect(payload.ok).toBe(false);
    if (!payload.ok) {
      expect(payload.code).toBe("ambiguous-entry");
      expect(payload.candidates).toEqual(["A.tsx", "B.tsx"]);
    }
  });

  it("rejects oversized / invalid folder maps", () => {
    const empty = runConvertRequest({ files: {} });
    expect(empty.status).toBe(400);

    const tooMany: Record<string, string> = {};
    for (let i = 0; i < SECTION_INPUT_LIMITS.maxFiles + 1; i++) {
      tooMany[`f${i}.tsx`] = "export const X = () => <div/>;";
    }
    const count = runConvertRequest({ files: tooMany, entryPath: "f0.tsx" });
    expect(count.status).toBe(400);
    if (!count.payload.ok) {
      expect(count.payload.code).toBe("file-count-limit");
    }
  });

  it("collectCssFromVirtualFiles is deterministic", () => {
    expect(
      collectCssFromVirtualFiles({
        "b.css": ".b{}",
        "a.css": ".a{}",
        "x.tsx": "export const X = () => null;",
      }),
    ).toBe(".a{}\n\n.b{}");
  });
});
