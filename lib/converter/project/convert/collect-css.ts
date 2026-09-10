/**
 * Collect CSS imported by modules in a route dependency graph (route-scoped).
 * Does not concatenate the entire project CSS tree.
 */

import {
  collectStaticImports,
  resolveModulePath,
} from "../../section-input/resolve-imports";
import type { ProjectDiagnostic } from "../types";

const CSS_IMPORT_EXT = /\.(css|scss|sass|less)$/i;

export type CollectRouteCssResult = {
  css: string[];
  cssPaths: string[];
  diagnostics: ProjectDiagnostic[];
};

/**
 * Walk module sources for relative CSS / style imports and load them from the
 * component/text file map when present.
 */
export function collectRouteScopedCss(args: {
  modulePaths: string[];
  moduleSources: Record<string, string>;
  /** Full text file map (may include .css not present in moduleSources). */
  textFiles: Record<string, string>;
}): CollectRouteCssResult {
  const diagnostics: ProjectDiagnostic[] = [];
  const cssPaths: string[] = [];
  const seen = new Set<string>();

  const orderedModules = [...args.modulePaths].sort((a, b) =>
    a.localeCompare(b),
  );

  for (const fromPath of orderedModules) {
    const source = args.moduleSources[fromPath];
    if (source === undefined) continue;

    const { imports, parseError } = collectStaticImports(source, fromPath);
    if (parseError) {
      diagnostics.push({
        severity: "info",
        code: "css-scan-parse-skipped",
        message: `Could not scan CSS imports in ${fromPath}: ${parseError}`,
        path: fromPath,
      });
      continue;
    }

    for (const imp of imports) {
      const spec = imp.specifier;
      if (!spec.startsWith("./") && !spec.startsWith("../")) {
        if (CSS_IMPORT_EXT.test(spec)) {
          diagnostics.push({
            severity: "warning",
            code: "external-css-skipped",
            message: `Non-relative CSS import skipped: ${JSON.stringify(spec)} in ${fromPath}`,
            path: fromPath,
          });
        }
        continue;
      }

      if (!CSS_IMPORT_EXT.test(spec)) {
        continue;
      }

      // Resolve against text file map (css files are not always in moduleSources).
      const resolved =
        resolveModulePath(args.textFiles, fromPath, spec) ??
        resolveCssPath(args.textFiles, fromPath, spec);

      if (!resolved) {
        diagnostics.push({
          severity: "warning",
          code: "css-import-unresolved",
          message: `CSS import could not be resolved: ${JSON.stringify(spec)} from ${fromPath}`,
          path: fromPath,
        });
        continue;
      }

      if (seen.has(resolved)) continue;
      seen.add(resolved);

      if (/\.module\.(css|scss|sass|less)$/i.test(resolved)) {
        diagnostics.push({
          severity: "warning",
          code: "css-modules-limited",
          message: `CSS module included as raw text only (no class-name rewriting): ${resolved}`,
          path: resolved,
        });
      }

      if (/\.(scss|sass|less)$/i.test(resolved)) {
        diagnostics.push({
          severity: "warning",
          code: "preprocessor-css-raw",
          message: `Preprocessor stylesheet included as raw text (not compiled): ${resolved}`,
          path: resolved,
        });
      }

      cssPaths.push(resolved);
    }
  }

  cssPaths.sort((a, b) => a.localeCompare(b));
  const css = cssPaths
    .map((p) => args.textFiles[p])
    .filter((c): c is string => typeof c === "string" && c.trim().length > 0);

  return { css, cssPaths, diagnostics };
}

function resolveCssPath(
  files: Record<string, string>,
  fromFile: string,
  specifier: string,
): string | null {
  // resolveModulePath already tries extensions; for explicit .css specs it should
  // hit the "" suffix. Fallback: normalize relative join manually via same helper.
  return resolveModulePath(files, fromFile, specifier);
}
