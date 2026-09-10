/**
 * Vite / CRA / plain React entry + optional static react-router discovery.
 */

import { parse as babelParse } from "@babel/parser";
import traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import { hasFile, listTextPaths, readTextFile } from "../fs/paths";
import type { ProjectManifest, ProjectRoute } from "../manifest/types";

const SPA_ENTRY_TIERS: string[][] = [
  ["src/main.tsx", "src/main.ts", "src/main.jsx", "src/main.js"],
  ["src/index.tsx", "src/index.ts", "src/index.jsx", "src/index.js"],
  ["main.tsx", "main.ts", "main.jsx", "main.js"],
  ["index.tsx", "index.ts", "index.jsx", "index.js"],
];

const EXT_RANK: Record<string, number> = {
  ".tsx": 0,
  ".ts": 1,
  ".jsx": 2,
  ".js": 3,
  ".mjs": 4,
};

function extRank(path: string): number {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return 99;
  return EXT_RANK[path.slice(dot).toLowerCase()] ?? 50;
}

/**
 * Pick a single SPA entry using tier priority.
 * Multiple matches in the winning tier → deterministic pick + warning (no guessing routes).
 */
export function resolveSpaEntry(
  vfs: ProjectVirtualFS,
  preferredCandidates?: string[],
): {
  entryFile: string | null;
  candidates: string[];
  diagnostics: ProjectDiagnostic[];
} {
  const diagnostics: ProjectDiagnostic[] = [];
  const all = preferredCandidates?.length
    ? preferredCandidates.filter((p) => hasFile(vfs, p))
    : SPA_ENTRY_TIERS.flat().filter((p) => hasFile(vfs, p));

  for (const tier of SPA_ENTRY_TIERS) {
    const hits = tier.filter((p) => hasFile(vfs, p));
    if (hits.length === 0) continue;
    if (hits.length === 1) {
      return { entryFile: hits[0]!, candidates: all, diagnostics };
    }
    const sorted = [...hits].sort(
      (a, b) => extRank(a) - extRank(b) || a.localeCompare(b),
    );
    diagnostics.push({
      severity: "warning",
      code: "ambiguous-spa-entry",
      message: `Multiple SPA entry files at the same priority: ${hits.join(", ")}. Using ${sorted[0]} without inventing extra routes.`,
    });
    return { entryFile: sorted[0]!, candidates: all, diagnostics };
  }

  if (all.length > 0) {
    // preferred list had files outside tiers — do not invent; warn
    diagnostics.push({
      severity: "warning",
      code: "ambiguous-spa-entry",
      message: `SPA entry candidates found but none matched the safe priority tiers: ${all.join(", ")}.`,
    });
  }

  return { entryFile: null, candidates: all, diagnostics };
}

function tryParse(source: string, sourcePath: string): t.File | null {
  const isTs = /\.tsx?$/.test(sourcePath);
  try {
    return babelParse(source, {
      sourceType: "module",
      plugins: ["jsx", ...(isTs ? (["typescript"] as const) : [])],
      errorRecovery: false,
      sourceFilename: sourcePath,
    });
  } catch {
    return null;
  }
}

function collectRoutePathsFromAst(ast: t.File): string[] {
  const paths = new Set<string>();

  traverse(ast, {
    JSXOpeningElement(path: NodePath<t.JSXOpeningElement>) {
      const name = path.node.name;
      if (!t.isJSXIdentifier(name)) return;
      if (name.name !== "Route" && name.name !== "RouteObject") return;
      for (const attr of path.node.attributes) {
        if (!t.isJSXAttribute(attr)) continue;
        if (!t.isJSXIdentifier(attr.name) || attr.name.name !== "path") continue;
        const v = attr.value;
        if (t.isStringLiteral(v)) {
          if (v.value.startsWith("/")) paths.add(v.value);
        } else if (t.isJSXExpressionContainer(v) && t.isStringLiteral(v.expression)) {
          if (v.expression.value.startsWith("/")) paths.add(v.expression.value);
        }
      }
    },
    ObjectExpression(path: NodePath<t.ObjectExpression>) {
      // { path: "/about", element: ... } inside createBrowserRouter arrays
      let pathValue: string | null = null;
      let looksLikeRoute = false;
      for (const prop of path.node.properties) {
        if (!t.isObjectProperty(prop) || prop.computed) continue;
        const key = t.isIdentifier(prop.key)
          ? prop.key.name
          : t.isStringLiteral(prop.key)
            ? prop.key.value
            : null;
        if (key === "path" && t.isStringLiteral(prop.value)) {
          pathValue = prop.value.value;
        }
        if (
          key === "element" ||
          key === "Component" ||
          key === "component" ||
          key === "lazy" ||
          key === "children"
        ) {
          looksLikeRoute = true;
        }
      }
      if (looksLikeRoute && pathValue && pathValue.startsWith("/")) {
        paths.add(pathValue);
      }
    },
  });

  return [...paths].sort((a, b) => a.localeCompare(b));
}

function routerScanFiles(vfs: ProjectVirtualFS, entryFile: string): string[] {
  const preferred = [
    entryFile,
    "src/App.tsx",
    "src/App.jsx",
    "src/App.ts",
    "src/App.js",
    "App.tsx",
    "App.jsx",
    "src/routes.tsx",
    "src/routes.jsx",
    "src/routes.ts",
    "src/routes.js",
    "src/router.tsx",
    "src/router.jsx",
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of preferred) {
    if (hasFile(vfs, p) && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  // Also include any *routes* / *router* under src (capped)
  for (const p of listTextPaths(vfs)) {
    if (seen.has(p)) continue;
    const base = p.split("/").pop() ?? "";
    if (/^(routes|router)\.(tsx|ts|jsx|js)$/i.test(base) && out.length < 12) {
      out.push(p);
      seen.add(p);
    }
  }
  return out;
}

/**
 * Discover SPA routes: static react-router paths when analyzable, else one entry.
 */
export function discoverSpaRoutes(
  vfs: ProjectVirtualFS,
  manifest: ProjectManifest,
): { routes: ProjectRoute[]; diagnostics: ProjectDiagnostic[] } {
  const diagnostics: ProjectDiagnostic[] = [];
  const { entryFile, diagnostics: entryDiags } = resolveSpaEntry(
    vfs,
    manifest.entryCandidates,
  );
  diagnostics.push(...entryDiags);

  if (!entryFile) {
    diagnostics.push({
      severity: "warning",
      code: "spa-entry-missing",
      message:
        "No safe SPA entry file found (src/main.*, src/index.*, main.*, index.*).",
    });
    return { routes: [], diagnostics };
  }

  const scanFiles = routerScanFiles(vfs, entryFile);
  const foundPaths = new Set<string>();
  for (const file of scanFiles) {
    const source = readTextFile(vfs, file);
    if (source == null) continue;
    const ast = tryParse(source, file);
    if (!ast) {
      diagnostics.push({
        severity: "info",
        code: "spa-router-parse-skipped",
        message: `Could not parse ${file} for static router paths.`,
        path: file,
      });
      continue;
    }
    for (const p of collectRoutePathsFromAst(ast)) {
      foundPaths.add(p);
    }
  }

  if (foundPaths.size > 0) {
    const routes: ProjectRoute[] = [...foundPaths]
      .sort((a, b) => a.localeCompare(b))
      .map((path) => {
        const isDynamic = path.includes(":");
        return {
          id: `spa:${path}`,
          path,
          kind: "page" as const,
          entryFile,
          layoutChain: [],
          dynamicSegments: isDynamic
            ? path
                .split("/")
                .filter((s) => s.startsWith(":"))
                .map((s) => s.slice(1))
            : [],
          isDynamic,
          confidence: isDynamic ? ("low" as const) : ("medium" as const),
          source: "react-router-static" as const,
        };
      });
    diagnostics.push({
      severity: "info",
      code: "spa-router-static",
      message: `Discovered ${routes.length} statically analyzable router path(s) from entry/App/routes modules.`,
    });
    return { routes, diagnostics };
  }

  diagnostics.push({
    severity: "warning",
    code: "spa-router-not-static",
    message:
      "No statically analyzable router configuration found; emitting a single entry route `/`.",
    path: entryFile,
  });

  return {
    routes: [
      {
        id: "spa:/",
        path: "/",
        kind: "entry",
        entryFile,
        layoutChain: [],
        dynamicSegments: [],
        isDynamic: false,
        confidence: "medium",
        source: "spa-entry",
      },
    ],
    diagnostics,
  };
}
