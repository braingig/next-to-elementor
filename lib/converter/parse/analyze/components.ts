import traverse from "@babel/traverse";
import type {
  File,
  FunctionDeclaration,
  ArrowFunctionExpression,
  FunctionExpression,
  Expression,
  JSXElement,
  JSXFragment,
} from "@babel/types";
import type { LocalComponentDef } from "./context";
import {
  analyzeComponentParams,
  paramNamesFromBinding,
} from "./bind-props";

type FnLike = FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;

function findReturnedJsx(fn: FnLike): Expression | JSXElement | JSXFragment | null {
  if (fn.body.type === "JSXElement" || fn.body.type === "JSXFragment") {
    return fn.body;
  }
  // Arrow expression body: `() => cond ? <A/> : <B/>`
  if (fn.body.type === "ConditionalExpression") {
    const c = unwrapParen(fn.body.consequent);
    const a = unwrapParen(fn.body.alternate);
    if (
      (c.type === "JSXElement" || c.type === "JSXFragment") &&
      (a.type === "JSXElement" || a.type === "JSXFragment")
    ) {
      return fn.body;
    }
  }
  if (fn.body.type === "BlockStatement") {
    for (const stmt of fn.body.body) {
      if (stmt.type === "ReturnStatement" && stmt.argument) {
        let arg: Expression = stmt.argument;
        while (arg.type === "ParenthesizedExpression") {
          arg = arg.expression;
        }
        if (arg.type === "JSXElement" || arg.type === "JSXFragment") {
          return arg;
        }
        // Allow `return cond ? <A/> : <B/>` so static prop-bound booleans can choose a branch.
        if (arg.type === "ConditionalExpression") {
          const c = unwrapParen(arg.consequent);
          const a = unwrapParen(arg.alternate);
          if (
            (c.type === "JSXElement" || c.type === "JSXFragment") &&
            (a.type === "JSXElement" || a.type === "JSXFragment")
          ) {
            return arg;
          }
        }
      }
    }
  }
  return null;
}

function unwrapParen(expr: Expression): Expression {
  let cur = expr;
  while (cur.type === "ParenthesizedExpression") {
    cur = cur.expression;
  }
  return cur;
}

function toLocalDef(
  name: string,
  fn: FnLike,
  jsxRoot: Expression | JSXElement | JSXFragment,
): LocalComponentDef {
  const paramBinding = analyzeComponentParams(fn);
  return {
    name,
    paramNames: paramNamesFromBinding(paramBinding),
    paramBinding,
    jsxRoot,
  };
}

/**
 * Collect function/const components in the same file that return JSX.
 * Definitions are stored for static inlining only — never executed.
 */
export function collectLocalComponents(ast: File): Map<string, LocalComponentDef> {
  const map = new Map<string, LocalComponentDef>();

  traverse(ast, {
    FunctionDeclaration(path) {
      if (!path.node.id) return;
      const jsxRoot = findReturnedJsx(path.node);
      if (!jsxRoot) return;
      map.set(path.node.id.name, toLocalDef(path.node.id.name, path.node, jsxRoot));
    },
    VariableDeclarator(path) {
      if (path.node.id.type !== "Identifier") return;
      const init = path.node.init;
      if (!init) return;
      if (
        init.type !== "ArrowFunctionExpression" &&
        init.type !== "FunctionExpression"
      ) {
        return;
      }
      const jsxRoot = findReturnedJsx(init);
      if (!jsxRoot) return;
      map.set(path.node.id.name, toLocalDef(path.node.id.name, init, jsxRoot));
    },
  });

  return map;
}

export type ComponentEntry = {
  name: string;
  isDefault: boolean;
  jsxRoot: Expression | JSXElement | JSXFragment;
};

/**
 * Prefer default export, then options.componentName, then first JSX-returning component.
 */
export function findEntryComponent(
  ast: File,
  preferredName?: string,
): ComponentEntry | null {
  const locals = collectLocalComponents(ast);
  let defaultName: string | undefined;
  const namedExports = new Set<string>();

  traverse(ast, {
    ExportDefaultDeclaration(path) {
      const decl = path.node.declaration;
      if (decl.type === "Identifier") {
        defaultName = decl.name;
      } else if (decl.type === "FunctionDeclaration" && decl.id) {
        defaultName = decl.id.name;
      } else if (
        decl.type === "FunctionDeclaration" ||
        decl.type === "ArrowFunctionExpression" ||
        decl.type === "FunctionExpression"
      ) {
        const jsxRoot = findReturnedJsx(decl);
        if (jsxRoot) {
          defaultName =
            decl.type === "FunctionDeclaration" && decl.id
              ? decl.id.name
              : "__default__";
          if (!locals.has(defaultName)) {
            locals.set(defaultName, toLocalDef(defaultName, decl, jsxRoot));
          }
        }
      }
    },
    ExportNamedDeclaration(path) {
      if (
        path.node.declaration?.type === "FunctionDeclaration" &&
        path.node.declaration.id
      ) {
        namedExports.add(path.node.declaration.id.name);
      }
      for (const spec of path.node.specifiers) {
        if (
          spec.type === "ExportSpecifier" &&
          spec.exported.type === "Identifier"
        ) {
          namedExports.add(spec.exported.name);
        }
      }
    },
  });

  if (preferredName && locals.has(preferredName)) {
    const def = locals.get(preferredName)!;
    return {
      name: preferredName,
      isDefault: preferredName === defaultName,
      jsxRoot: def.jsxRoot,
    };
  }

  if (defaultName && locals.has(defaultName)) {
    const def = locals.get(defaultName)!;
    return { name: defaultName, isDefault: true, jsxRoot: def.jsxRoot };
  }

  const names = [...locals.keys()].sort();
  const first = names[0];
  if (first) {
    const def = locals.get(first)!;
    return { name: first, isDefault: false, jsxRoot: def.jsxRoot };
  }

  let topJsx: JSXElement | JSXFragment | null = null;
  for (const stmt of ast.program.body) {
    if (
      stmt.type === "ExpressionStatement" &&
      (stmt.expression.type === "JSXElement" ||
        stmt.expression.type === "JSXFragment")
    ) {
      topJsx = stmt.expression;
      break;
    }
  }
  if (topJsx) {
    return { name: "__jsx_root__", isDefault: true, jsxRoot: topJsx };
  }

  return null;
}
