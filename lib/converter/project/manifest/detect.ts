/**
 * Framework detection from ProjectVirtualFS (Phase 13b).
 * Reads package.json / configs as text only. Never installs or loads node_modules.
 */

import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import {
  hasFile,
  listTextPaths,
  readTextFile,
} from "../fs/paths";
import type {
  DetectionConfidence,
  ProjectFrameworkKind,
  ProjectManifest,
  ProjectPackageJsonSummary,
  ProjectStyleSystem,
} from "./types";

const NEXT_CONFIG_RE = /^next\.config\.(js|mjs|cjs|ts)$/;
const VITE_CONFIG_RE = /^vite\.config\.(js|mjs|cjs|ts)$/;
const TAILWIND_CONFIG_RE = /^tailwind\.config\.(js|mjs|cjs|ts)$/;

const SPA_ENTRY_TIERS: string[][] = [
  ["src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js"],
  ["src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js"],
  ["main.tsx", "main.ts", "main.jsx", "main.js"],
  ["index.tsx", "index.ts", "index.jsx", "index.js"],
];

function mergeDeps(
  pkg: ProjectPackageJsonSummary,
): Record<string, string> {
  return { ...pkg.dependencies, ...pkg.devDependencies };
}

function parsePackageJson(
  vfs: ProjectVirtualFS,
  diagnostics: ProjectDiagnostic[],
): ProjectPackageJsonSummary | undefined {
  if (!hasFile(vfs, "package.json")) {
    diagnostics.push({
      severity: "info",
      code: "package-json-missing",
      message: "No package.json at project root.",
      path: "package.json",
    });
    return undefined;
  }

  const raw = readTextFile(vfs, "package.json");
  if (raw == null) {
    diagnostics.push({
      severity: "warning",
      code: "package-json-unreadable",
      message: "package.json exists but is not readable as text.",
      path: "package.json",
    });
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as {
      name?: unknown;
      dependencies?: unknown;
      devDependencies?: unknown;
    };
    const dependencies =
      parsed.dependencies &&
      typeof parsed.dependencies === "object" &&
      !Array.isArray(parsed.dependencies)
        ? (parsed.dependencies as Record<string, string>)
        : {};
    const devDependencies =
      parsed.devDependencies &&
      typeof parsed.devDependencies === "object" &&
      !Array.isArray(parsed.devDependencies)
        ? (parsed.devDependencies as Record<string, string>)
        : {};
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      dependencies,
      devDependencies,
    };
  } catch {
    diagnostics.push({
      severity: "warning",
      code: "package-json-malformed",
      message: "package.json could not be parsed as JSON.",
      path: "package.json",
    });
    return {
      dependencies: {},
      devDependencies: {},
      parseError: true,
    };
  }
}

function parsePathAliases(
  vfs: ProjectVirtualFS,
): Record<string, string[]> {
  for (const configPath of ["tsconfig.json", "jsconfig.json"]) {
    const raw = readTextFile(vfs, configPath);
    if (raw == null) continue;
    try {
      // Strip block/line comments loosely for TS config JSONC.
      const stripped = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const parsed = JSON.parse(stripped) as {
        compilerOptions?: { paths?: Record<string, string[]> };
      };
      const paths = parsed.compilerOptions?.paths;
      if (paths && typeof paths === "object") {
        const out: Record<string, string[]> = {};
        for (const [key, value] of Object.entries(paths)) {
          if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
            out[key] = value;
          }
        }
        return out;
      }
    } catch {
      // ignore unreadable config
    }
  }
  return {};
}

function collectConfigFiles(vfs: ProjectVirtualFS): string[] {
  return listTextPaths(vfs).filter((p) => {
    const base = p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
    return (
      NEXT_CONFIG_RE.test(base) ||
      VITE_CONFIG_RE.test(base) ||
      TAILWIND_CONFIG_RE.test(base) ||
      base === "craco.config.js" ||
      base === "react-scripts"
    );
  });
}

function hasAppRouterPages(vfs: ProjectVirtualFS): boolean {
  return listTextPaths(vfs).some((p) => {
    const normalized = p.replace(/\\/g, "/");
    return (
      /(^|\/)app\//.test(normalized) &&
      /\/page\.(tsx|jsx|js|mjs)$/.test(normalized)
    );
  });
}

function hasPagesRouterPages(vfs: ProjectVirtualFS): boolean {
  return listTextPaths(vfs).some((p) => {
    const normalized = p.replace(/\\/g, "/");
    if (!/(^|\/)pages\//.test(normalized)) return false;
    if (/(^|\/)pages\/api\//.test(normalized)) return false;
    return /\.(tsx|jsx|js|mjs)$/.test(normalized);
  });
}

function detectStyleSystems(
  vfs: ProjectVirtualFS,
  deps: Record<string, string>,
): ProjectStyleSystem[] {
  const systems = new Set<ProjectStyleSystem>();
  const paths = listTextPaths(vfs);

  if (
    deps.tailwindcss ||
    paths.some((p) => TAILWIND_CONFIG_RE.test(p.split("/").pop() ?? ""))
  ) {
    systems.add("tailwind");
  }
  if (paths.some((p) => /\.module\.css$/i.test(p))) {
    systems.add("css-modules");
  }
  if (paths.some((p) => /\.scss$/i.test(p)) || deps.sass || deps["sass-loader"]) {
    systems.add("scss");
  }
  if (paths.some((p) => /\.sass$/i.test(p))) {
    systems.add("sass");
  }
  if (paths.some((p) => /\.less$/i.test(p)) || deps.less) {
    systems.add("less");
  }
  if (paths.some((p) => /\.css$/i.test(p))) {
    systems.add("css");
  }
  if (systems.size === 0) {
    systems.add("unknown");
  }
  return [...systems];
}

function collectSpaEntryCandidates(vfs: ProjectVirtualFS): string[] {
  const found: string[] = [];
  for (const tier of SPA_ENTRY_TIERS) {
    for (const path of tier) {
      if (hasFile(vfs, path)) found.push(path);
    }
  }
  return found;
}

function pickFramework(args: {
  deps: Record<string, string>;
  configFiles: string[];
  hasApp: boolean;
  hasPages: boolean;
  spaEntries: string[];
  diagnostics: ProjectDiagnostic[];
}): {
  framework: ProjectFrameworkKind;
  confidence: DetectionConfidence;
  version?: string;
} {
  const hasNextDep = Boolean(args.deps.next);
  const hasNextConfig = args.configFiles.some((p) =>
    NEXT_CONFIG_RE.test(p.split("/").pop() ?? ""),
  );
  const hasVite =
    Boolean(args.deps.vite) ||
    args.configFiles.some((p) => VITE_CONFIG_RE.test(p.split("/").pop() ?? ""));
  const hasCra = Boolean(args.deps["react-scripts"]);
  const hasReact = Boolean(args.deps.react);

  // A `pages/` folder alone is not enough when Vite is present without Next
  // indicators — Vite apps commonly use `src/pages` for React Router views.
  const pagesImpliesNext =
    args.hasPages && !(hasVite && !hasNextDep && !hasNextConfig);
  const looksLikeNext =
    hasNextDep || hasNextConfig || args.hasApp || pagesImpliesNext;

  if (looksLikeNext) {
    const version = args.deps.next;
    if (args.hasApp && args.hasPages) {
      return {
        framework: "next-hybrid",
        confidence: hasNextDep || hasNextConfig ? "high" : "medium",
        version,
      };
    }
    if (args.hasApp) {
      return {
        framework: "next-app",
        confidence: hasNextDep || hasNextConfig ? "high" : "medium",
        version,
      };
    }
    if (args.hasPages) {
      return {
        framework: "next-pages",
        confidence: hasNextDep || hasNextConfig ? "high" : "medium",
        version,
      };
    }
    // next dep/config but no routes yet
    args.diagnostics.push({
      severity: "warning",
      code: "next-routes-missing",
      message:
        "Next.js indicators found but no App Router page.* or Pages Router pages were discovered.",
    });
    return {
      framework: "unknown",
      confidence: "low",
      version,
    };
  }

  if (hasCra) {
    return {
      framework: "cra",
      confidence: "high",
      version: args.deps["react-scripts"],
    };
  }

  if (hasVite && hasReact) {
    return {
      framework: "vite-react",
      confidence: "high",
      version: args.deps.vite,
    };
  }

  if (hasVite && !hasReact) {
    args.diagnostics.push({
      severity: "warning",
      code: "vite-without-react",
      message: "Vite detected without a react dependency; treating as unknown.",
    });
    return { framework: "unknown", confidence: "low", version: args.deps.vite };
  }

  if (hasReact && args.spaEntries.length > 0) {
    return { framework: "react-plain", confidence: "medium" };
  }

  if (hasReact) {
    return { framework: "react-plain", confidence: "low" };
  }

  if (args.spaEntries.length > 0) {
    args.diagnostics.push({
      severity: "warning",
      code: "react-dependency-missing",
      message:
        "SPA entry file(s) found but react was not listed in package.json.",
    });
    return { framework: "react-plain", confidence: "low" };
  }

  return { framework: "unknown", confidence: "low" };
}

/**
 * Detect framework, TypeScript, style systems, and entry candidates from VFS.
 */
export function detectFramework(vfs: ProjectVirtualFS): ProjectManifest {
  const diagnostics: ProjectDiagnostic[] = [];
  const packageJson = parsePackageJson(vfs, diagnostics);
  const deps = packageJson ? mergeDeps(packageJson) : {};
  const configFiles = collectConfigFiles(vfs);
  const hasApp = hasAppRouterPages(vfs);
  const hasPages = hasPagesRouterPages(vfs);
  const entryCandidates = collectSpaEntryCandidates(vfs);

  const picked = pickFramework({
    deps,
    configFiles,
    hasApp,
    hasPages,
    spaEntries: entryCandidates,
    diagnostics,
  });

  const typescript =
    Boolean(deps.typescript) ||
    hasFile(vfs, "tsconfig.json") ||
    listTextPaths(vfs).some((p) => /\.tsx?$/i.test(p));

  return {
    framework: picked.framework,
    frameworkConfidence: picked.confidence,
    ...(picked.version ? { frameworkVersion: picked.version } : {}),
    typescript,
    styleSystems: detectStyleSystems(vfs, deps),
    ...(packageJson ? { packageJson } : {}),
    pathAliases: parsePathAliases(vfs),
    configFiles,
    entryCandidates,
    diagnostics,
  };
}
