import { describe, expect, it } from "vitest";
import {
  isFolderAssetPath,
  isFolderComponentPath,
  isFolderTextPath,
  readFolderSelection,
  splitWebkitRelativePath,
} from "@/app/lib/folder-files";

/**
 * Lightweight UI contract checks that do not require a browser or RTL.
 * Mirrors filename sanitization used by ConverterWorkspace download.
 */
function safeDownloadBasename(title: string): string {
  return (
    (title.trim() || "converted-section")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "converted-section"
  );
}

describe("Phase 12 UI helpers", () => {
  it("sanitizes download filenames", () => {
    expect(safeDownloadBasename("My Hero!")).toBe("My-Hero");
    expect(safeDownloadBasename("  ")).toBe("converted-section");
    expect(safeDownloadBasename("../evil")).toBe("..-evil");
  });
});

describe("folder-files browser helpers", () => {
  it("classifies text vs asset paths", () => {
    expect(isFolderTextPath("Hero.tsx")).toBe(true);
    expect(isFolderTextPath("styles.css")).toBe(true);
    expect(isFolderComponentPath("Hero.tsx")).toBe(true);
    expect(isFolderComponentPath("styles.css")).toBe(false);
    expect(isFolderAssetPath("assets/hero.png")).toBe(true);
    expect(isFolderAssetPath("Hero.tsx")).toBe(false);
  });

  it("splits webkitRelativePath into section-relative paths", () => {
    expect(splitWebkitRelativePath("HeroSection/HeroSection.tsx")).toEqual({
      sectionName: "HeroSection",
      relativePath: "HeroSection.tsx",
    });
    expect(
      splitWebkitRelativePath("HeroSection/components/Button.tsx"),
    ).toEqual({
      sectionName: "HeroSection",
      relativePath: "components/Button.tsx",
    });
    expect(splitWebkitRelativePath("../escape.tsx")).toBeNull();
  });

  it("readFolderSelection builds map, detects entry, skips assets", async () => {
    const files = [
      fileWithPath(
        "RealWorldSection/RealWorldSection.tsx",
        `import HeroContent from "./HeroContent";
export default function RealWorldSection() { return <HeroContent />; }`,
      ),
      fileWithPath(
        "RealWorldSection/HeroContent.tsx",
        `export default function HeroContent() { return <h1>Hi</h1>; }`,
      ),
      fileWithPath("RealWorldSection/styles.css", ".x { color: red; }"),
      fileWithPath("RealWorldSection/assets/hero.png", "not-really-png"),
    ];

    const selection = await readFolderSelection(files);
    expect(selection.sectionName).toBe("RealWorldSection");
    expect(selection.textPaths).toEqual([
      "HeroContent.tsx",
      "RealWorldSection.tsx",
      "styles.css",
    ]);
    expect(selection.assetPaths).toEqual(["assets/hero.png"]);
    expect(selection.suggestedEntryPath).toBe("RealWorldSection.tsx");
    expect(selection.css).toContain("color: red");
    expect(selection.files["assets/hero.png"]).toBeUndefined();
  });

  it("surfaces ambiguous entry for manual selection", async () => {
    const selection = await readFolderSelection([
      fileWithPath("Sec/A.tsx", `export default function A() { return <h1/>; }`),
      fileWithPath("Sec/B.tsx", `export default function B() { return <h1/>; }`),
    ]);
    expect(selection.suggestedEntryPath).toBeUndefined();
    expect(selection.entryCandidates).toEqual(["A.tsx", "B.tsx"]);
    expect(selection.componentPaths).toEqual(["A.tsx", "B.tsx"]);
  });
});

function fileWithPath(webkitRelativePath: string, contents: string): File {
  const name = webkitRelativePath.split("/").pop() ?? webkitRelativePath;
  const file = new File([contents], name, { type: "text/plain" });
  Object.defineProperty(file, "webkitRelativePath", {
    value: webkitRelativePath,
  });
  return file;
}
