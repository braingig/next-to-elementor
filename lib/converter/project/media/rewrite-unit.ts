/**
 * Rewrite packaged ConversionUnit sources/CSS with public media URLs.
 * Operates on copies only — never mutates ProjectVirtualFS.
 */

import { parse } from "@babel/parser";
import generate from "@babel/generator";
import traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import type { ConversionUnit } from "../convert/types";
import type { ProjectAssetReference } from "../assets/types";
import type { ProjectDiagnostic } from "../types";

function tryParse(source: string, sourcePath: string): t.File | null {
  const isTs = /\.tsx?$/i.test(sourcePath) || !/\.jsx?$/i.test(sourcePath);
  try {
    return parse(source, {
      sourceType: "module",
      plugins: ["jsx", ...(isTs ? (["typescript"] as const) : [])],
      errorRecovery: false,
      sourceFilename: sourcePath,
    });
  } catch {
    return null;
  }
}

function isImportMetaUrl(
  node: t.Expression | t.SpreadElement | t.ArgumentPlaceholder,
): boolean {
  return (
    t.isMemberExpression(node) &&
    !node.computed &&
    t.isMetaProperty(node.object) &&
    node.object.meta.name === "import" &&
    node.object.property.name === "meta" &&
    t.isIdentifier(node.property) &&
    node.property.name === "url"
  );
}

/**
 * Per-module binding → public URL from 14b references (avoids cross-module
 * collisions on the flat route-level assetBindings map).
 */
function bindingUrlsForSource(
  sourcePath: string,
  references: ProjectAssetReference[] | undefined,
  urlByAssetPath: Record<string, string>,
  fallbackBindings?: Record<string, string>,
): Map<string, string> {
  const out = new Map<string, string>();
  // Route-level binding map (includes import locals from 14b).
  if (fallbackBindings) {
    for (const [binding, assetPath] of Object.entries(fallbackBindings)) {
      const url = urlByAssetPath[assetPath];
      if (url) out.set(binding, url);
    }
  }
  if (references) {
    for (const ref of references) {
      if (ref.source !== sourcePath) continue;
      if (ref.status !== "resolved" || !ref.assetPath) continue;
      if (
        ref.kind !== "jsx-src" &&
        ref.kind !== "const-binding" &&
        ref.kind !== "import"
      ) {
        continue;
      }
      // Identifier bindings only (string src/specifiers handled elsewhere).
      if (!/^[A-Za-z_$][\w$]*$/.test(ref.expression)) continue;
      const url = urlByAssetPath[ref.assetPath];
      if (url) out.set(ref.expression, url);
    }
  }
  return out;
}

function resolveStringToUrl(
  literal: string,
  sourcePath: string,
  references: ProjectAssetReference[] | undefined,
  urlByAssetPath: Record<string, string>,
): string | null {
  if (urlByAssetPath[literal]) return urlByAssetPath[literal]!;
  if (!references) return null;
  for (const ref of references) {
    if (ref.source !== sourcePath) continue;
    if (ref.status !== "resolved" || !ref.assetPath) continue;
    if (ref.expression !== literal) continue;
    const url = urlByAssetPath[ref.assetPath];
    if (url) return url;
  }
  return null;
}

function rewriteJsSource(args: {
  source: string;
  sourcePath: string;
  bindingUrls: Map<string, string>;
  references: ProjectAssetReference[] | undefined;
  urlByAssetPath: Record<string, string>;
}): { source: string; changed: boolean } {
  const ast = tryParse(args.source, args.sourcePath);
  if (!ast) return { source: args.source, changed: false };

  let changed = false;

  traverse(ast, {
    JSXAttribute(path: NodePath<t.JSXAttribute>) {
      if (!t.isJSXIdentifier(path.node.name) || path.node.name.name !== "src") {
        return;
      }
      const value = path.node.value;
      if (!value) return;

      if (t.isStringLiteral(value)) {
        const resolved = resolveStringToUrl(
          value.value,
          args.sourcePath,
          args.references,
          args.urlByAssetPath,
        );
        if (resolved && value.value !== resolved) {
          path.node.value = t.stringLiteral(resolved);
          changed = true;
        }
        return;
      }

      if (
        t.isJSXExpressionContainer(value) &&
        t.isIdentifier(value.expression)
      ) {
        const url = args.bindingUrls.get(value.expression.name);
        if (url) {
          path.node.value = t.stringLiteral(url);
          changed = true;
        }
      }
    },

    NewExpression(path: NodePath<t.NewExpression>) {
      if (!t.isIdentifier(path.node.callee, { name: "URL" })) return;
      if (path.node.arguments.length < 2) return;
      const first = path.node.arguments[0];
      const second = path.node.arguments[1];
      if (!t.isStringLiteral(first) || !second || !isImportMetaUrl(second)) {
        return;
      }
      const resolved = resolveStringToUrl(
        first.value,
        args.sourcePath,
        args.references,
        args.urlByAssetPath,
      );
      if (resolved && first.value !== resolved) {
        first.value = resolved;
        changed = true;
      }
    },

    // Object fields used by static .map() data: `{ src: residential }` → URL string
    // so Phase E can treat the array as fully static after media upload.
    ObjectProperty(path: NodePath<t.ObjectProperty>) {
      if (path.node.computed) return;
      if (path.node.shorthand) return;
      const value = path.node.value;
      if (!t.isIdentifier(value)) return;
      const url = args.bindingUrls.get(value.name);
      if (!url) return;
      path.node.value = t.stringLiteral(url);
      changed = true;
    },
  });

  if (!changed) return { source: args.source, changed: false };

  // Babel generator typings can disagree across @babel/types versions.
  const out = (
    generate as unknown as (
      ast: t.File,
      opts: Record<string, unknown>,
    ) => { code: string }
  )(ast, {
    retainLines: false,
    compact: false,
    jsescOption: { minimal: true },
  }).code;
  return { source: out, changed: true };
}

function rewriteCssSource(args: {
  css: string;
  cssPath: string;
  references: ProjectAssetReference[] | undefined;
  urlByAssetPath: Record<string, string>;
}): { css: string; changed: boolean } {
  if (!args.references || Object.keys(args.urlByAssetPath).length === 0) {
    return { css: args.css, changed: false };
  }

  let changed = false;
  const css = args.css.replace(
    /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi,
    (full, quote: string, raw: string) => {
      const trimmed = raw.trim();
      for (const ref of args.references!) {
        if (ref.source !== args.cssPath) continue;
        if (ref.kind !== "css-url") continue;
        if (ref.status !== "resolved" || !ref.assetPath) continue;
        if (ref.expression !== trimmed) continue;
        const url = args.urlByAssetPath[ref.assetPath];
        if (!url) continue;
        changed = true;
        const q = quote || '"';
        return `url(${q}${url}${q})`;
      }
      return full;
    },
  );

  return { css, changed };
}

/**
 * Return a new ConversionUnit with packaged sources rewritten to public URLs.
 */
export function rewriteConversionUnitMediaUrls(
  unit: ConversionUnit,
  urlByAssetPath: Record<string, string>,
): { unit: ConversionUnit; diagnostics: ProjectDiagnostic[] } {
  const diagnostics: ProjectDiagnostic[] = [];
  if (Object.keys(urlByAssetPath).length === 0) {
    return { unit, diagnostics };
  }

  const moduleSources: Record<string, string> = {};
  let anyChange = false;

  for (const [path, source] of Object.entries(unit.moduleSources)) {
    const rewritten = rewriteJsSource({
      source,
      sourcePath: path,
      bindingUrls: bindingUrlsForSource(
        path,
        unit.assetReferences,
        urlByAssetPath,
        unit.assetBindings,
      ),
      references: unit.assetReferences,
      urlByAssetPath,
    });
    moduleSources[path] = rewritten.source;
    if (rewritten.changed) anyChange = true;
  }

  const knownComponentSources: Record<string, string> = {};
  for (const [name, oldSource] of Object.entries(unit.knownComponentSources)) {
    // Prefer rewritten moduleSources when this known source came from a module.
    let matchedPath: string | null = null;
    for (const [modPath, oldMod] of Object.entries(unit.moduleSources)) {
      if (oldMod === oldSource) {
        matchedPath = modPath;
        break;
      }
    }
    if (matchedPath && moduleSources[matchedPath]) {
      knownComponentSources[name] = moduleSources[matchedPath]!;
      continue;
    }

    const sourcePath = matchedPath ?? unit.entryFile;
    const rewritten = rewriteJsSource({
      source: oldSource,
      sourcePath,
      bindingUrls: bindingUrlsForSource(
        sourcePath,
        unit.assetReferences,
        urlByAssetPath,
        unit.assetBindings,
      ),
      references: unit.assetReferences,
      urlByAssetPath,
    });
    knownComponentSources[name] = rewritten.source;
    if (rewritten.changed) anyChange = true;
  }

  let entrySource = unit.entrySource;
  if (
    unit.moduleSources[unit.entryFile] !== undefined &&
    unit.entrySource === unit.moduleSources[unit.entryFile] &&
    moduleSources[unit.entryFile]
  ) {
    entrySource = moduleSources[unit.entryFile]!;
  } else {
    const rewritten = rewriteJsSource({
      source: entrySource,
      sourcePath: unit.entryFile,
      bindingUrls: bindingUrlsForSource(
        unit.entryFile,
        unit.assetReferences,
        urlByAssetPath,
        unit.assetBindings,
      ),
      references: unit.assetReferences,
      urlByAssetPath,
    });
    entrySource = rewritten.source;
    if (rewritten.changed) anyChange = true;
  }

  const css: string[] = [];
  for (let i = 0; i < unit.css.length; i++) {
    const cssPath = unit.cssPaths[i] ?? `css#${i}`;
    const rewritten = rewriteCssSource({
      css: unit.css[i]!,
      cssPath,
      references: unit.assetReferences,
      urlByAssetPath,
    });
    css.push(rewritten.css);
    if (rewritten.changed) anyChange = true;
  }

  if (anyChange) {
    diagnostics.push({
      severity: "info",
      code: "media-urls-rewritten",
      message: `Rewrote packaged sources/CSS with ${Object.keys(urlByAssetPath).length} WordPress media URL(s) for route ${unit.route.path}.`,
      path: unit.entryFile,
    });
  }

  return {
    unit: {
      ...unit,
      entrySource,
      moduleSources,
      knownComponentSources,
      css,
      diagnostics: [...unit.diagnostics, ...diagnostics],
    },
    diagnostics,
  };
}
