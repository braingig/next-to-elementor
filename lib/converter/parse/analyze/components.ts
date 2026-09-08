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

type FnLike = FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;

function getParamNames(fn: FnLike): string[] {
  return fn.params.map((p) => {
    if (p.type === "Identifier") {
      return p.name;
    }
    return "";
  }).filter(Boolean);
}

function findReturnedJsx(fn: FnLike): Expression | JSXElement | JSXFragment | null {
  if (fn.body.type === "JSXElement" || fn.body.type === "JSXFragment") {
    return fn.body;
  }
  if (fn.body.type === "BlockStatement") {
    for (const stmt of fn.body.body) {
      if (stmt.type === "ReturnStatement" && stmt.argument) {
        if (
          stmt.argument.type === "JSXElement" ||
          stmt.argument.type === "JSXFragment" ||
          stmt.argument.type === "ParenthesizedExpression"
        ) {
          let arg: Expression = stmt.argument;
          while (arg.type === "ParenthesizedExpression") {
            arg = arg.expression;
          }
          if (arg.type === "JSXElement" || arg.type === "JSXFragment") {
            return arg;
          }
        }
      }
    }
  }
  return null;
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
      map.set(path.node.id.name, {
        name: path.node.id.name,
        paramNames: getParamNames(path.node),
        jsxRoot,
      });
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
      map.set(path.node.id.name, {
        name: path.node.id.name,
        paramNames: getParamNames(init),
        jsxRoot,
      });
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
          defaultName = decl.type === "FunctionDeclaration" && decl.id
            ? decl.id.name
            : "__default__";
          if (!locals.has(defaultName)) {
            locals.set(defaultName, {
              name: defaultName,
              paramNames: getParamNames(decl),
              jsxRoot,
            });
          }
        }
      }
    },
    ExportNamedDeclaration(path) {
      if (path.node.declaration?.type === "FunctionDeclaration" && path.node.declaration.id) {
        namedExports.add(path.node.declaration.id.name);
      }
      for (const spec of path.node.specifiers) {
        if (spec.type === "ExportSpecifier" && spec.exported.type === "Identifier") {
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

  // First local component (deterministic: sorted names)
  const names = [...locals.keys()].sort();
  const first = names[0];
  if (first) {
    const def = locals.get(first)!;
    return { name: first, isDefault: false, jsxRoot: def.jsxRoot };
  }

  // Top-level JSX expression statement fallback
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
