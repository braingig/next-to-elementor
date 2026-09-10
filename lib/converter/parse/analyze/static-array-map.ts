/**
 * Static Array.map() expansion — AST analysis only, never executes user code.
 */

import traverse from "@babel/traverse";
import type {
  ArrayExpression,
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  File,
  FunctionExpression,
  Node,
  ObjectExpression,
} from "@babel/types";
import type { IrNode } from "../../ir/schema";
import {
  addDiagnostic,
  emptyProvenance,
  locFromBabel,
  nextId,
  unsupportedNode,
  type AnalyzerContext,
  type PropScope,
} from "./context";
import {
  extractStaticPrimitive,
  type StaticPrimitive,
} from "./static-value";

export type StaticObjectFields = Map<string, StaticPrimitive>;

export type StaticArrayElement =
  | { kind: "primitive"; value: StaticPrimitive }
  | { kind: "object"; fields: StaticObjectFields };

/**
 * Extract a fully-static array literal into analyzable elements.
 * Returns null if any element is dynamic / unsupported.
 */
export function extractStaticArrayElements(
  node: ArrayExpression,
): StaticArrayElement[] | null {
  const out: StaticArrayElement[] = [];
  for (const el of node.elements) {
    if (!el) {
      return null;
    }
    if (el.type === "SpreadElement") {
      return null;
    }
    if (el.type === "ObjectExpression") {
      const fields = extractStaticObjectFields(el);
      if (!fields) {
        return null;
      }
      out.push({ kind: "object", fields });
      continue;
    }
    const prim = extractStaticPrimitive(el);
    if (!prim.ok) {
      return null;
    }
    out.push({ kind: "primitive", value: prim.value });
  }
  return out;
}

function extractStaticObjectFields(
  node: ObjectExpression,
): StaticObjectFields | null {
  const fields: StaticObjectFields = new Map();
  for (const prop of node.properties) {
    if (prop.type === "SpreadElement" || prop.type === "ObjectMethod") {
      return null;
    }
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return null;
    }
    let key: string | undefined;
    if (prop.key.type === "Identifier") {
      key = prop.key.name;
    } else if (prop.key.type === "StringLiteral") {
      key = prop.key.value;
    } else {
      return null;
    }
    const prim = extractStaticPrimitive(prop.value as Expression);
    if (!prim.ok) {
      return null;
    }
    fields.set(key, prim.value);
  }
  return fields;
}

export { extractStaticObjectFields };

/**
 * Collect `const name = { ... }` bindings that are fully static object literals.
 * A later non-static declarator with the same name removes the binding.
 */
export function collectStaticObjectBindings(
  ast: File,
): Map<string, StaticObjectFields> {
  const map = new Map<string, StaticObjectFields>();

  traverse(ast, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (id.type !== "Identifier") {
        return;
      }
      const name = id.name;
      if (!init) {
        map.delete(name);
        return;
      }
      if (init.type === "ObjectExpression") {
        const fields = extractStaticObjectFields(init);
        if (fields) {
          map.set(name, fields);
          return;
        }
      }
      map.delete(name);
    },
  });

  return map;
}

/**
 * Collect file-level / function-level `const/let/var name = [ ... ]` bindings
 * that are fully static. A later non-static declarator with the same name
 * removes the binding (honest unresolved).
 */
export function collectStaticArrayBindings(
  ast: File,
): Map<string, StaticArrayElement[]> {
  const map = new Map<string, StaticArrayElement[]>();

  traverse(ast, {
    VariableDeclarator(path) {
      const { id, init } = path.node;
      if (id.type !== "Identifier") {
        return;
      }
      const name = id.name;
      if (!init) {
        map.delete(name);
        return;
      }
      if (init.type === "ArrayExpression") {
        const elements = extractStaticArrayElements(init);
        if (elements) {
          map.set(name, elements);
          return;
        }
      }
      // Non-static (or non-array) binding shadows any prior static array.
      map.delete(name);
    },
  });

  return map;
}

type MapCallback = ArrowFunctionExpression | FunctionExpression;

function unwrapParen(expr: Expression): Expression {
  let cur = expr;
  while (cur.type === "ParenthesizedExpression") {
    cur = cur.expression;
  }
  return cur;
}

/**
 * Resolve the JSX/expression body of a map callback for static expansion.
 * Rejects blocks with anything other than a single return of JSX/expression.
 */
export function getMapCallbackBody(fn: MapCallback): Expression | null {
  if (fn.body.type !== "BlockStatement") {
    return unwrapParen(fn.body);
  }
  const returns = fn.body.body.filter((s) => s.type === "ReturnStatement");
  if (returns.length !== 1 || fn.body.body.length !== 1) {
    // Extra statements (let, if, …) — do not execute / approximate.
    return null;
  }
  const ret = returns[0]!;
  if (ret.type !== "ReturnStatement" || !ret.argument) {
    return null;
  }
  return unwrapParen(ret.argument);
}

export type MapParamBinding =
  | { kind: "identifier"; name: string }
  | {
      kind: "destructured";
      bindings: Array<{ propName: string; localName: string }>;
    }
  | { kind: "unsupported" };

function analyzeMapItemParam(param: Node): MapParamBinding {
  if (param.type === "Identifier") {
    return { kind: "identifier", name: param.name };
  }
  if (param.type === "ObjectPattern") {
    const bindings: Array<{ propName: string; localName: string }> = [];
    for (const prop of param.properties) {
      if (prop.type === "RestElement" || prop.type !== "ObjectProperty") {
        return { kind: "unsupported" };
      }
      if (prop.computed) {
        return { kind: "unsupported" };
      }
      let propName: string | undefined;
      if (prop.key.type === "Identifier") {
        propName = prop.key.name;
      } else if (prop.key.type === "StringLiteral") {
        propName = prop.key.value;
      } else {
        return { kind: "unsupported" };
      }
      if (prop.value.type !== "Identifier") {
        return { kind: "unsupported" };
      }
      bindings.push({ propName, localName: prop.value.name });
    }
    return { kind: "destructured", bindings };
  }
  return { kind: "unsupported" };
}

function buildItemScope(
  itemParam: MapParamBinding,
  element: StaticArrayElement,
  indexName: string | undefined,
  index: number,
): PropScope | null {
  const values = new Map<string, StaticPrimitive>();
  const objectBindings = new Map<string, StaticObjectFields>();

  if (indexName) {
    values.set(indexName, index);
  }

  if (itemParam.kind === "unsupported") {
    return null;
  }

  if (itemParam.kind === "identifier") {
    if (element.kind === "primitive") {
      values.set(itemParam.name, element.value);
    } else {
      objectBindings.set(itemParam.name, element.fields);
    }
  } else {
    // Destructuring requires an object element.
    if (element.kind !== "object") {
      return null;
    }
    for (const b of itemParam.bindings) {
      if (!element.fields.has(b.propName)) {
        // Missing field — leave unbound (honest Identifier later) rather than inventing.
        continue;
      }
      values.set(b.localName, element.fields.get(b.propName)!);
    }
  }

  return {
    values,
    ...(objectBindings.size > 0 ? { objectBindings } : {}),
  };
}

function isMapCall(node: CallExpression): boolean {
  return (
    node.callee.type === "MemberExpression" &&
    !node.callee.computed &&
    node.callee.property.type === "Identifier" &&
    node.callee.property.name === "map"
  );
}

function resolveMapArrayElements(
  ctx: AnalyzerContext,
  object: Expression,
):
  | { ok: true; elements: StaticArrayElement[] }
  | { ok: false; reason: string } {
  const unwrapped = unwrapParen(object);
  if (unwrapped.type === "ArrayExpression") {
    const elements = extractStaticArrayElements(unwrapped);
    if (!elements) {
      return {
        ok: false,
        reason: "Array literal passed to .map() is not fully static.",
      };
    }
    return { ok: true, elements };
  }
  if (unwrapped.type === "Identifier") {
    const bound = ctx.staticArrays.get(unwrapped.name);
    if (!bound) {
      return {
        ok: false,
        reason: `Identifier "${unwrapped.name}" is not a statically known array literal.`,
      };
    }
    return { ok: true, elements: bound };
  }
  return {
    ok: false,
    reason: "Array.map() receiver is not a static array literal or const binding.",
  };
}

/**
 * Attempt static expansion of `array.map(callback)`.
 * Returns null when the call is not a `.map` (caller handles other calls).
 * Returns an unsupported IR node when `.map` cannot be expanded safely.
 */
export function convertStaticArrayMap(
  ctx: AnalyzerContext,
  node: CallExpression,
  convertExpression: (ctx: AnalyzerContext, expr: Node) => IrNode,
): IrNode | null {
  if (!isMapCall(node)) {
    return null;
  }

  const loc = locFromBabel(node);
  const callee = node.callee;
  if (callee.type !== "MemberExpression") {
    return null;
  }

  const arrayResult = resolveMapArrayElements(ctx, callee.object as Expression);
  if (!arrayResult.ok) {
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-children",
      message: `Array.map() cannot be expanded statically: ${arrayResult.reason}`,
      originalSummary: ".map(...)",
      loc,
    });
  }

  if (node.arguments.length === 0 || node.arguments.length > 1) {
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-children",
      message:
        "Array.map() expansion requires a single callback argument (static analysis only).",
      originalSummary: ".map(...)",
      loc,
    });
  }

  const arg = node.arguments[0]!;
  if (arg.type === "SpreadElement") {
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-children",
      message: "Spread callback arguments to Array.map() are not supported.",
      originalSummary: ".map(...)",
      loc,
    });
  }

  if (
    arg.type !== "ArrowFunctionExpression" &&
    arg.type !== "FunctionExpression"
  ) {
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-children",
      message:
        "Array.map() callback must be an inline arrow/function expression (static analysis only).",
      originalSummary: ".map(...)",
      loc,
    });
  }

  if (arg.params.length === 0 || arg.params.length > 2) {
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-children",
      message:
        "Array.map() callback must take one item parameter (optional index as second).",
      originalSummary: ".map(...)",
      loc,
    });
  }

  const itemParam = analyzeMapItemParam(arg.params[0]!);
  if (itemParam.kind === "unsupported") {
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-children",
      message:
        "Array.map() item parameter shape is not supported for static expansion.",
      originalSummary: ".map(...)",
      loc,
    });
  }

  let indexName: string | undefined;
  if (arg.params.length === 2) {
    const idx = arg.params[1]!;
    if (idx.type !== "Identifier") {
      return unsupportedNode(ctx, {
        reasonCode: "dynamic-children",
        message:
          "Array.map() index parameter must be a simple identifier for static expansion.",
        originalSummary: ".map(...)",
        loc,
      });
    }
    indexName = idx.name;
  }

  const body = getMapCallbackBody(arg);
  if (!body) {
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-children",
      message:
        "Array.map() callback body has unsupported statements or is not a direct JSX return (static analysis only — callback is not executed).",
      originalSummary: ".map(...)",
      loc,
    });
  }

  const children: IrNode[] = [];
  for (let i = 0; i < arrayResult.elements.length; i += 1) {
    const element = arrayResult.elements[i]!;
    const scope = buildItemScope(itemParam, element, indexName, i);
    if (!scope) {
      return unsupportedNode(ctx, {
        reasonCode: "dynamic-children",
        message:
          "Array.map() element shape does not match the callback parameter for static expansion.",
        originalSummary: ".map(...)",
        loc,
      });
    }

    ctx.propScopes.push(scope);
    try {
      children.push(convertExpression(ctx, body));
    } finally {
      ctx.propScopes.pop();
    }
  }

  addDiagnostic(ctx, {
    severity: "info",
    code: "static-array-map",
    message: `Statically expanded Array.map() into ${children.length} element(s) (no code execution).`,
    loc,
  });

  return {
    id: nextId(ctx),
    kind: "group",
    status: "ok",
    props: {},
    style: {},
    provenance: emptyProvenance({
      sourcePath: ctx.sourcePath,
      loc,
      componentName: "Array.map",
    }),
    notes: ["static-array-map-expanded"],
    children,
  };
}
