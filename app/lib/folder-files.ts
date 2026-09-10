/**
 * Browser helpers for section-folder selection.
 * Builds a virtual file map from <input webkitdirectory> FileList.
 * Never executes files. Never sends real filesystem absolute paths.
 * Intentionally does NOT import lib/converter (keeps the client bundle free of
 * Node/Babel converter modules).
 */

export type VirtualFiles = Record<string, string>;

const TEXT_RE = /\.(tsx|ts|jsx|js|css)$/i;
const ASSET_RE = /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|eot)$/i;
const COMPONENT_RE = /\.(tsx|jsx|ts|js)$/i;
const ENTRY_EXTENSIONS = [".tsx", ".jsx", ".ts", ".js"] as const;

export type FolderSelection = {
  sectionName: string;
  files: VirtualFiles;
  textPaths: string[];
  assetPaths: string[];
  css: string;
  suggestedEntryPath?: string;
  componentPaths: string[];
  entryError?: string;
  entryCandidates?: string[];
};

function extensionOf(path: string): string {
  const i = path.lastIndexOf(".");
  return i >= 0 ? path.slice(i).toLowerCase() : "";
}

export function isFolderTextPath(path: string): boolean {
  return TEXT_RE.test(path);
}

export function isFolderAssetPath(path: string): boolean {
  return ASSET_RE.test(path);
}

export function isFolderComponentPath(path: string): boolean {
  return COMPONENT_RE.test(path) && !/\.d\.ts$/i.test(path);
}

/** Mirror of section-input normalizeVirtualPath (browser-safe, no Buffer). */
export function normalizeClientPath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.includes("\0")) {
    return null;
  }
  const path = raw.replace(/\\/g, "/").trim();
  if (
    !path ||
    path.startsWith("/") ||
    path.startsWith("//") ||
    /^[a-zA-Z]:/.test(path) ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)
  ) {
    return null;
  }
  const parts = path.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    if (part.includes(":")) return null;
    out.push(part);
  }
  return out.length === 0 ? null : out.join("/");
}

/**
 * Convert a browser webkitRelativePath into section-root-relative POSIX path.
 */
export function splitWebkitRelativePath(webkitRelativePath: string): {
  sectionName: string;
  relativePath: string;
} | null {
  const normalized = webkitRelativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((p) => p === ".." || p === ".")) {
    return null;
  }
  if (parts.length === 1) {
    const rel = normalizeClientPath(parts[0]!);
    if (!rel) return null;
    return {
      sectionName: rel.replace(/\.[^.]+$/, "") || "section",
      relativePath: rel,
    };
  }
  const sectionName = parts[0]!;
  const relativePath = normalizeClientPath(parts.slice(1).join("/"));
  if (!relativePath) return null;
  return { sectionName, relativePath };
}

function firstExisting(files: string[], candidates: string[]): string | undefined {
  const set = new Set(files);
  for (const c of candidates) {
    if (set.has(c)) return c;
  }
  return undefined;
}

function folderNameCandidates(sectionName: string): string[] {
  const base = sectionName.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!base || base.includes("/") || base === "." || base === "..") return [];
  const out: string[] = [];
  for (const ext of ENTRY_EXTENSIONS) {
    out.push(`${base}/${base}${ext}`);
    out.push(`${base}${ext}`);
  }
  return out;
}

/**
 * Same priority as lib/converter/section-input/resolve-entry (client copy).
 */
export function suggestEntryPath(args: {
  componentPaths: string[];
  sectionName?: string;
  entryPath?: string;
}): {
  entryPath?: string;
  error?: string;
  candidates?: string[];
} {
  const components = [...args.componentPaths].sort((a, b) =>
    a.localeCompare(b),
  );

  if (args.entryPath) {
    const normalized = normalizeClientPath(args.entryPath);
    if (!normalized || !components.includes(normalized)) {
      return {
        error: `Explicit entryPath not found: ${args.entryPath}`,
        candidates: components,
      };
    }
    return { entryPath: normalized };
  }

  if (args.sectionName) {
    const match = firstExisting(
      components,
      folderNameCandidates(args.sectionName),
    );
    if (match) return { entryPath: match };
  }

  const indexMatch = firstExisting(components, [
    "index.tsx",
    "index.jsx",
    "index.ts",
    "index.js",
  ]);
  if (indexMatch) return { entryPath: indexMatch };

  if (components.length === 1) return { entryPath: components[0] };
  if (components.length === 0) {
    return { error: "No entry component file found." };
  }
  return {
    error:
      "Multiple possible entry files found. Select an entry file, then Convert.",
    candidates: components,
  };
}

/**
 * Read a FileList from <input type="file" webkitdirectory> into a FolderSelection.
 */
export async function readFolderSelection(
  fileList: FileList | File[],
): Promise<FolderSelection> {
  const filesArr = Array.from(fileList);
  const files: VirtualFiles = {};
  const assetPaths: string[] = [];
  let sectionName = "section";

  for (const file of filesArr) {
    const relative =
      "webkitRelativePath" in file &&
      typeof file.webkitRelativePath === "string" &&
      file.webkitRelativePath
        ? file.webkitRelativePath
        : file.name;
    const split = splitWebkitRelativePath(relative);
    if (!split) continue;
    sectionName = split.sectionName;
    const { relativePath } = split;

    if (isFolderAssetPath(relativePath)) {
      assetPaths.push(relativePath);
      continue;
    }
    if (!isFolderTextPath(relativePath)) {
      continue;
    }
    const text = await file.text();
    files[relativePath] = text;
  }

  const textPaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const componentPaths = textPaths
    .filter(isFolderComponentPath)
    .sort((a, b) => a.localeCompare(b));
  const css = textPaths
    .filter((p) => extensionOf(p) === ".css")
    .map((p) => files[p] ?? "")
    .filter((c) => c.trim().length > 0)
    .join("\n\n");

  const entry = suggestEntryPath({ componentPaths, sectionName });

  return {
    sectionName,
    files,
    textPaths,
    assetPaths: [...new Set(assetPaths)].sort((a, b) => a.localeCompare(b)),
    css,
    componentPaths,
    ...(entry.entryPath
      ? { suggestedEntryPath: entry.entryPath }
      : {
          entryError: entry.error,
          entryCandidates: entry.candidates,
        }),
  };
}
