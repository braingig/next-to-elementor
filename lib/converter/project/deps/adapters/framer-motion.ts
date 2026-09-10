/**
 * framer-motion / motion static adapter — NEVER loads the package.
 * Rewrites motion.* JSX to plain elements and strips animation props.
 */

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import type { DependencyAdapter, AdapterApplyResult } from "./types";

const ANIMATION_PROPS = new Set([
  "initial",
  "animate",
  "exit",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileDrag",
  "whileInView",
  "transition",
  "variants",
  "layout",
  "layoutId",
  "drag",
  "dragConstraints",
  "onAnimationStart",
  "onAnimationComplete",
]);

/**
 * Strip `prop={...}` / `prop="..."` including nested object braces.
 * Never executes expressions — text surgery only.
 */
function stripNamedProp(source: string, prop: string): {
  code: string;
  count: number;
} {
  const marker = `${prop}=`;
  let code = "";
  let i = 0;
  let count = 0;

  while (i < source.length) {
    const at = source.indexOf(marker, i);
    if (at === -1) {
      code += source.slice(i);
      break;
    }
    // Require whitespace or JSX start before the prop name.
    if (at > 0 && !/[\s/]/.test(source[at - 1]!)) {
      code += source.slice(i, at + marker.length);
      i = at + marker.length;
      continue;
    }
    code += source.slice(i, at);
    let j = at + marker.length;
    const ch = source[j];
    if (ch === "{") {
      let depth = 0;
      let k = j;
      for (; k < source.length; k++) {
        const c = source[k]!;
        if (c === "{") depth += 1;
        else if (c === "}") {
          depth -= 1;
          if (depth === 0) {
            k += 1;
            break;
          }
        }
      }
      count += 1;
      i = k;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let k = j + 1;
      while (k < source.length) {
        if (source[k] === "\\") {
          k += 2;
          continue;
        }
        if (source[k] === quote) {
          k += 1;
          break;
        }
        k += 1;
      }
      count += 1;
      i = k;
      continue;
    }
    // Boolean prop form `layout` without `=` is handled separately; leave unknown.
    code += marker;
    i = j;
  }

  return { code, count };
}

/**
 * Conservative source rewrite without @babel/generator:
 * 1) drop framer-motion / motion imports
 * 2) motion.div → div (etc.)
 * 3) strip known animation attributes (including nested object props)
 */
export function rewriteMotionSourceText(source: string): {
  code: string;
  strippedProps: number;
  motionTags: number;
  removedImport: boolean;
} {
  let code = source;
  let removedImport = false;
  let motionTags = 0;
  let strippedProps = 0;

  const importRe =
    /^[ \t]*import\s+[\s\S]*?from\s+['"](?:framer-motion|motion)['"]\s*;?[ \t]*\n?/gm;
  if (importRe.test(code)) {
    removedImport = true;
    code = code.replace(importRe, "");
  }

  code = code.replace(/\bmotion\.([A-Za-z][\w]*)/g, (_m, tag: string) => {
    motionTags += 1;
    return tag;
  });

  for (const prop of ANIMATION_PROPS) {
    const result = stripNamedProp(code, prop);
    code = result.code;
    strippedProps += result.count;
  }

  // Boolean-ish bare props: layout / drag when used as ` layout` / ` drag`
  for (const bare of ["layout", "drag"] as const) {
    const bareRe = new RegExp(`\\s${bare}(?=(\\s|/|>))`, "g");
    const before = code;
    code = code.replace(bareRe, "");
    if (code !== before) strippedProps += 1;
  }

  return { code, strippedProps, motionTags, removedImport };
}

function detectComplexMotionUsage(source: string): boolean {
  // AnimatePresence, useAnimation, motion() factory — not handled statically.
  if (/\bAnimatePresence\b/.test(source)) return true;
  if (/\buseAnimation\b/.test(source)) return true;
  if (/\buseScroll\b/.test(source)) return true;
  if (/\bmotion\s*\(/.test(source)) return true;
  return false;
}

function hasMotionImport(source: string): boolean {
  return /from\s+['"](?:framer-motion|motion)['"]/.test(source);
}

/** Optional AST validation that motion members became identifiers — static only. */
function validateNoMotionMembers(source: string, sourcePath: string): boolean {
  try {
    const isTs = /\.tsx?$/i.test(sourcePath);
    const ast = parse(source, {
      sourceType: "module",
      plugins: ["jsx", ...(isTs ? (["typescript"] as const) : [])],
      errorRecovery: false,
    });
    let bad = false;
    traverse(ast, {
      JSXMemberExpression(path) {
        const obj = path.node.object;
        if (t.isJSXIdentifier(obj) && obj.name === "motion") {
          bad = true;
        }
      },
    });
    return !bad;
  } catch {
    return true; // don't block on parse; string rewrite already applied
  }
}

export const framerMotionAdapter: DependencyAdapter = {
  id: "framer-motion",
  apply(input): AdapterApplyResult {
    const diagnostics = [];
    const rewrittenModuleSources: Record<string, string> = {
      ...input.moduleSources,
    };
    let rewrittenEntrySource = input.entrySource;
    let totalStripped = 0;
    let totalMotion = 0;
    let anyRewrite = false;

    const seenPaths = new Set<string>();

    for (const [path, source] of Object.entries(input.moduleSources)) {
      seenPaths.add(path);
      if (detectComplexMotionUsage(source)) {
        diagnostics.push({
          severity: "warning" as const,
          code: "dependency-unsupported",
          message: `framer-motion: complex runtime APIs in ${path} are not statically adapted.`,
          path,
        });
        return { status: "unsupported", diagnostics };
      }

      if (!hasMotionImport(source) && !/\bmotion\./.test(source)) {
        continue;
      }

      const result = rewriteMotionSourceText(source);
      if (result.code !== source) {
        rewrittenModuleSources[path] = result.code;
        anyRewrite = true;
      }
      totalStripped += result.strippedProps;
      totalMotion += result.motionTags;
      void validateNoMotionMembers(result.code, path);
    }

    if (
      hasMotionImport(input.entrySource) ||
      /\bmotion\./.test(input.entrySource)
    ) {
      if (detectComplexMotionUsage(input.entrySource)) {
        diagnostics.push({
          severity: "warning" as const,
          code: "dependency-unsupported",
          message:
            "framer-motion: complex runtime APIs in entry source are not statically adapted.",
          path: input.entryFile,
        });
        return { status: "unsupported", diagnostics };
      }
      // Avoid double-counting when entrySource duplicates a moduleSources path.
      const entryAlreadyCounted =
        seenPaths.has(input.entryFile) &&
        input.moduleSources[input.entryFile] === input.entrySource;
      const result = rewriteMotionSourceText(input.entrySource);
      if (result.code !== input.entrySource) {
        rewrittenEntrySource = result.code;
        anyRewrite = true;
        if (!entryAlreadyCounted) {
          totalStripped += result.strippedProps;
          totalMotion += result.motionTags;
        }
      }
    }

    if (totalStripped > 0 || totalMotion > 0) {
      diagnostics.push({
        severity: "warning" as const,
        code: "dependency-animation-not-preserved",
        message: `framer-motion: rewrote ${totalMotion} motion tag(s) and removed ~${totalStripped} animation prop group(s); children kept as static elements (package not executed).`,
      });
    } else {
      diagnostics.push({
        severity: "info" as const,
        code: "dependency-adapter-applied",
        message:
          "framer-motion import observed; no motion JSX found to rewrite (package not executed).",
      });
    }

    return {
      status: totalStripped > 0 || totalMotion > 0 ? "partial" : "supported",
      diagnostics,
      ...(anyRewrite
        ? { rewrittenModuleSources, rewrittenEntrySource }
        : {}),
    };
  },
};
