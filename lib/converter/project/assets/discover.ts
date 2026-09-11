/**
 * Phase 14b — route-scoped static asset discovery.
 * Never executes source. Never reads outside ProjectVirtualFS.
 */

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import type { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { collectStaticImports } from "../../section-input/resolve-imports";
import type { PathAliases } from "../../section-input/resolve-aliases";
import type { ProjectDiagnostic, ProjectVirtualFS } from "../types";
import type { ConversionUnit } from "../convert/types";
import { assetKindForExtension, isImageAssetPath } from "./extensions";
import {
  expandRootAbsoluteCandidates,
  firstExistingAssetPath,
  resolveAssetSpecifierToPath,
} from "./resolve-path";
import type {
  ProjectAsset,
  ProjectAssetReference,
  RouteAssetDiscoveryResult,
} from "./types";

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

function isImportMetaUrl(node: t.Expression | t.SpreadElement | t.ArgumentPlaceholder): boolean {
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

type BindingMap = Map<string, string>;

function recordAsset(
  assets: Map<string, ProjectAsset>,
  path: string,
  presence: ProjectAsset["presence"],
  size: number,
  extension: string,
  skipReason?: string,
): ProjectAsset {
  const existing = assets.get(path);
  if (existing) {
    // Upgrade missing → skipped/present if we learn more.
    if (
      existing.presence === "missing" &&
      (presence === "present" || presence === "skipped")
    ) {
      const next: ProjectAsset = {
        path,
        kind: assetKindForExtension(extension || existing.extension),
        size,
        extension: extension || existing.extension,
        presence,
        ...(skipReason ? { skipReason } : {}),
      };
      assets.set(path, next);
      return next;
    }
    return existing;
  }
  const asset: ProjectAsset = {
    path,
    kind: assetKindForExtension(extension),
    size,
    extension,
    presence,
    ...(skipReason ? { skipReason } : {}),
  };
  assets.set(path, asset);
  return asset;
}

function pushResolvedDiag(
  diagnostics: ProjectDiagnostic[],
  ref: ProjectAssetReference,
): void {
  if (ref.status === "resolved" && ref.assetPath) {
    diagnostics.push({
      severity: "info",
      code: "asset-reference-resolved",
      message:
        ref.message ??
        `Resolved asset reference ${JSON.stringify(ref.expression)} → ${JSON.stringify(ref.assetPath)} (${ref.kind}) in ${ref.source}.`,
      path: ref.source,
    });
  } else if (ref.status === "skipped") {
    diagnostics.push({
      severity: "warning",
      code: "asset-reference-skipped",
      message:
        ref.message ??
        `Asset reference ${JSON.stringify(ref.expression)} maps to ${JSON.stringify(ref.assetPath)} but the asset was soft-skipped during ZIP admission (Phase 14a).`,
      path: ref.source,
    });
  } else if (ref.status === "dynamic") {
    diagnostics.push({
      severity: "warning",
      code: "asset-reference-dynamic",
      message:
        ref.message ??
        `Asset reference ${JSON.stringify(ref.expression)} is dynamic and was not resolved (static analysis only) in ${ref.source}.`,
      path: ref.source,
    });
  } else {
    diagnostics.push({
      severity: "warning",
      code: "asset-reference-unresolved",
      message:
        ref.message ??
        `Asset reference ${JSON.stringify(ref.expression)} could not be resolved to a ProjectVirtualFS asset in ${ref.source}.`,
      path: ref.source,
    });
  }
}

function resolveSpecifierRef(args: {
  vfs: ProjectVirtualFS;
  fromFile: string;
  specifier: string;
  pathAliases?: PathAliases;
  kind: ProjectAssetReference["kind"];
  expression: string;
  assets: Map<string, ProjectAsset>;
}): ProjectAssetReference {
  const lookup = resolveAssetSpecifierToPath({
    specifier: args.specifier,
    fromFile: args.fromFile,
    pathAliases: args.pathAliases,
  });

  if (lookup.reason === "external") {
    return {
      source: args.fromFile,
      kind: args.kind,
      expression: args.expression,
      status: "dynamic",
      message: `Non-local URL/protocol asset reference skipped: ${JSON.stringify(args.specifier)}.`,
    };
  }

  if (lookup.reason === "unsafe") {
    return {
      source: args.fromFile,
      kind: args.kind,
      expression: args.expression,
      status: "unresolved",
      message: `Unsafe asset path rejected (VFS-only): ${JSON.stringify(args.specifier)}.`,
    };
  }

  if (!lookup.path) {
    return {
      source: args.fromFile,
      kind: args.kind,
      expression: args.expression,
      status: "unresolved",
      message: `Could not map asset specifier ${JSON.stringify(args.specifier)} to a VFS path.`,
    };
  }

  const candidates =
    args.specifier.startsWith("/") && !args.specifier.startsWith("//")
      ? expandRootAbsoluteCandidates(lookup.path, args.vfs)
      : [lookup.path];

  const hit = firstExistingAssetPath(args.vfs, candidates);
  if (!hit) {
    return {
      source: args.fromFile,
      kind: args.kind,
      expression: args.expression,
      assetPath: lookup.path,
      status: "unresolved",
    };
  }

  recordAsset(
    args.assets,
    hit.path,
    hit.lookup.presence,
    hit.lookup.size,
    hit.lookup.extension,
    hit.lookup.skipReason,
  );

  if (hit.lookup.presence === "present") {
    return {
      source: args.fromFile,
      kind: args.kind,
      expression: args.expression,
      assetPath: hit.path,
      status: "resolved",
    };
  }

  if (hit.lookup.presence === "skipped") {
    return {
      source: args.fromFile,
      kind: args.kind,
      expression: args.expression,
      assetPath: hit.path,
      status: "skipped",
      message: `Asset ${JSON.stringify(hit.path)} was soft-skipped (${hit.lookup.skipReason ?? "asset limit"}); reference not treated as a missing file.`,
    };
  }

  return {
    source: args.fromFile,
    kind: args.kind,
    expression: args.expression,
    assetPath: hit.path,
    status: "unresolved",
    message: `Asset file not found in ProjectVirtualFS: ${JSON.stringify(hit.path)}.`,
  };
}

/**
 * Discover static asset imports, JSX src bindings, new URL(...), and CSS url().
 */
export function discoverRouteAssets(args: {
  vfs: ProjectVirtualFS;
  unit: ConversionUnit;
  pathAliases?: PathAliases;
}): RouteAssetDiscoveryResult & { diagnostics: ProjectDiagnostic[] } {
  const diagnostics: ProjectDiagnostic[] = [];
  const assets = new Map<string, ProjectAsset>();
  const references: ProjectAssetReference[] = [];
  /** per-module local binding → asset path (present only) */
  const moduleBindings = new Map<string, BindingMap>();
  /** merged route-level binding → path (last write wins; used for JSX in same file) */
  const bindingToAssetPath: Record<string, string> = {};

  const modulePaths = [
    ...new Set([
      args.unit.entryFile,
      ...Object.keys(args.unit.moduleSources),
      ...args.unit.graph.nodes,
    ]),
  ].sort((a, b) => a.localeCompare(b));

  for (const fromPath of modulePaths) {
    const source =
      args.unit.moduleSources[fromPath] ??
      (args.vfs.files[fromPath]?.kind === "text"
        ? args.vfs.files[fromPath].content
        : undefined);
    if (source == null) continue;

    const bindings: BindingMap = moduleBindings.get(fromPath) ?? new Map();
    moduleBindings.set(fromPath, bindings);

    // --- Static imports of image assets ---
    const { imports, parseError } = collectStaticImports(source, fromPath);
    if (parseError) {
      diagnostics.push({
        severity: "info",
        code: "asset-scan-parse-skipped",
        message: `Could not parse ${fromPath} for asset imports: ${parseError}`,
        path: fromPath,
      });
    } else {
      for (const imp of imports) {
        if (imp.isTypeOnly) continue;
        if (!isImageAssetPath(imp.specifier)) continue;

        const ref = resolveSpecifierRef({
          vfs: args.vfs,
          fromFile: fromPath,
          specifier: imp.specifier,
          pathAliases: args.pathAliases,
          kind: "import",
          expression: imp.specifier,
          assets,
        });
        references.push(ref);
        pushResolvedDiag(diagnostics, ref);

        if (
          (ref.status === "resolved" || ref.status === "skipped") &&
          ref.assetPath
        ) {
          for (const name of imp.localNames) {
            bindings.set(name, ref.assetPath);
            if (ref.status === "resolved") {
              bindingToAssetPath[name] = ref.assetPath;
            }
          }
        }
      }
    }

    const ast = tryParse(source, fromPath);
    if (!ast) continue;

    // --- const / let rebinding to asset imports or string paths ---
    traverse(ast, {
      VariableDeclarator(path: NodePath<t.VariableDeclarator>) {
        if (!t.isIdentifier(path.node.id)) return;
        const name = path.node.id.name;
        const init = path.node.init;
        if (!init) return;

        if (t.isIdentifier(init)) {
          const target = bindings.get(init.name);
          if (target) {
            bindings.set(name, target);
            bindingToAssetPath[name] = target;
            const ref: ProjectAssetReference = {
              source: fromPath,
              kind: "const-binding",
              expression: name,
              assetPath: target,
              status: "resolved",
              message: `Const binding ${JSON.stringify(name)} aliases imported asset ${JSON.stringify(target)}.`,
            };
            references.push(ref);
            pushResolvedDiag(diagnostics, ref);
          }
          return;
        }

        if (t.isStringLiteral(init) && isImageAssetPath(init.value)) {
          const ref = resolveSpecifierRef({
            vfs: args.vfs,
            fromFile: fromPath,
            specifier: init.value,
            pathAliases: args.pathAliases,
            kind: "const-binding",
            expression: name,
            assets,
          });
          references.push(ref);
          pushResolvedDiag(diagnostics, ref);
          if (ref.status === "resolved" && ref.assetPath) {
            bindings.set(name, ref.assetPath);
            bindingToAssetPath[name] = ref.assetPath;
          }
        }
      },

      // new URL("./x.png", import.meta.url)
      NewExpression(path: NodePath<t.NewExpression>) {
        if (!t.isIdentifier(path.node.callee, { name: "URL" })) return;
        if (path.node.arguments.length < 2) return;
        const first = path.node.arguments[0];
        const second = path.node.arguments[1];
        if (!second || !isImportMetaUrl(second)) return;

        if (!t.isStringLiteral(first)) {
          const expr = t.isIdentifier(first)
            ? first.name
            : "new URL(<dynamic>, import.meta.url)";
          const ref: ProjectAssetReference = {
            source: fromPath,
            kind: "new-url",
            expression: expr,
            status: "dynamic",
            message: `new URL(..., import.meta.url) first argument is not a static string in ${fromPath}.`,
          };
          references.push(ref);
          pushResolvedDiag(diagnostics, ref);
          return;
        }

        const ref = resolveSpecifierRef({
          vfs: args.vfs,
          fromFile: fromPath,
          specifier: first.value,
          pathAliases: args.pathAliases,
          kind: "new-url",
          expression: `new URL(${JSON.stringify(first.value)}, import.meta.url)`,
          assets,
        });
        references.push(ref);
        pushResolvedDiag(diagnostics, ref);

        // Bind if used as const x = new URL(...)
        const parent = path.parentPath;
        if (
          ref.status === "resolved" &&
          ref.assetPath &&
          parent.isVariableDeclarator() &&
          t.isIdentifier(parent.node.id)
        ) {
          bindings.set(parent.node.id.name, ref.assetPath);
          bindingToAssetPath[parent.node.id.name] = ref.assetPath;
        }
      },

      // <img src={hero} /> / <img src="./x.jpg" />
      JSXAttribute(path: NodePath<t.JSXAttribute>) {
        if (!t.isJSXIdentifier(path.node.name) || path.node.name.name !== "src") {
          return;
        }
        const opening = path.parentPath;
        if (!opening.isJSXOpeningElement()) return;
        const tag = opening.node.name;
        if (!t.isJSXIdentifier(tag)) return;
        const tagName = tag.name;
        if (tagName !== "img" && tagName !== "Image") return;

        const value = path.node.value;
        if (!value) return;

        if (t.isStringLiteral(value)) {
          const ref = resolveSpecifierRef({
            vfs: args.vfs,
            fromFile: fromPath,
            specifier: value.value,
            pathAliases: args.pathAliases,
            kind: "jsx-src",
            expression: value.value,
            assets,
          });
          // Absolute http(s) strings are external, not unresolved local assets.
          if (
            ref.status === "dynamic" &&
            /^(https?:|data:)/i.test(value.value)
          ) {
            // Do not emit noisy diagnostics for intentional remote URLs.
            return;
          }
          references.push(ref);
          pushResolvedDiag(diagnostics, ref);
          return;
        }

        if (
          t.isJSXExpressionContainer(value) &&
          !t.isJSXEmptyExpression(value.expression)
        ) {
          const expr = value.expression;
          if (t.isIdentifier(expr)) {
            const assetPath = bindings.get(expr.name);
            if (assetPath) {
              const lookup = firstExistingAssetPath(args.vfs, [assetPath]);
              const presence = lookup?.lookup.presence ?? "missing";
              recordAsset(
                assets,
                assetPath,
                presence,
                lookup?.lookup.size ?? 0,
                lookup?.lookup.extension ?? "",
                lookup?.lookup.skipReason,
              );
              const status =
                presence === "present"
                  ? "resolved"
                  : presence === "skipped"
                    ? "skipped"
                    : "unresolved";
              const ref: ProjectAssetReference = {
                source: fromPath,
                kind: "jsx-src",
                expression: expr.name,
                assetPath,
                status,
              };
              references.push(ref);
              pushResolvedDiag(diagnostics, ref);
              return;
            }
            const ref: ProjectAssetReference = {
              source: fromPath,
              kind: "jsx-src",
              expression: expr.name,
              status: "unresolved",
              message: `JSX img src={${expr.name}} is not a known static asset binding in ${fromPath}.`,
            };
            references.push(ref);
            pushResolvedDiag(diagnostics, ref);
            return;
          }

          if (t.isStringLiteral(expr)) {
            const ref = resolveSpecifierRef({
              vfs: args.vfs,
              fromFile: fromPath,
              specifier: expr.value,
              pathAliases: args.pathAliases,
              kind: "jsx-src",
              expression: expr.value,
              assets,
            });
            references.push(ref);
            pushResolvedDiag(diagnostics, ref);
            return;
          }

          const ref: ProjectAssetReference = {
            source: fromPath,
            kind: "jsx-src",
            expression: "src={<non-static>}",
            status: "dynamic",
            message: `JSX img src expression is not a static identifier or string in ${fromPath}.`,
          };
          references.push(ref);
          pushResolvedDiag(diagnostics, ref);
        }
      },
    });
  }

  // --- CSS url() in route-scoped CSS ---
  for (let i = 0; i < args.unit.css.length; i++) {
    const css = args.unit.css[i]!;
    const cssPath = args.unit.cssPaths[i] ?? `css#${i}`;
    discoverCssUrls({
      css,
      cssPath,
      vfs: args.vfs,
      pathAliases: args.pathAliases,
      assets,
      references,
      diagnostics,
    });
  }

  return {
    assets: [...assets.values()].sort((a, b) => a.path.localeCompare(b.path)),
    references,
    bindingToAssetPath,
    diagnostics,
  };
}

const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;

function discoverCssUrls(args: {
  css: string;
  cssPath: string;
  vfs: ProjectVirtualFS;
  pathAliases?: PathAliases;
  assets: Map<string, ProjectAsset>;
  references: ProjectAssetReference[];
  diagnostics: ProjectDiagnostic[];
}): void {
  CSS_URL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = CSS_URL_RE.exec(args.css)) !== null) {
    const raw = match[2]!.trim();
    if (!raw) continue;

    if (/^var\s*\(/i.test(raw) || raw.startsWith("var(")) {
      const ref: ProjectAssetReference = {
        source: args.cssPath,
        kind: "css-url",
        expression: raw,
        status: "dynamic",
        message: `CSS url() uses a CSS variable and cannot be resolved statically: ${raw}`,
      };
      args.references.push(ref);
      pushResolvedDiag(args.diagnostics, ref);
      continue;
    }

    if (/^(https?:|data:|file:|blob:)/i.test(raw)) {
      continue;
    }

    const ref = resolveSpecifierRef({
      vfs: args.vfs,
      fromFile: args.cssPath,
      specifier: raw,
      pathAliases: args.pathAliases,
      kind: "css-url",
      expression: raw,
      assets: args.assets,
    });
    args.references.push(ref);
    pushResolvedDiag(args.diagnostics, ref);
  }
}
