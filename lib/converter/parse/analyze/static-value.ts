import type {
  Expression,
  JSXAttribute,
  JSXElement,
  JSXExpressionContainer,
  JSXFragment,
  JSXSpreadAttribute,
  Node,
  ObjectExpression,
  TemplateLiteral,
} from "@babel/types";

/**
 * Static-only value extraction.
 * Never calls functions, never evaluates user code.
 */

export type StaticPrimitive = string | number | boolean | null;

export type StaticExtraction =
  | { ok: true; value: StaticPrimitive }
  | { ok: false; reason: string };

/** Optional environment for resolving bound static component props. */
export type StaticPropEnv = {
  lookupIdentifier: (
    name: string,
  ) => { found: true; value: StaticPrimitive } | { found: false };
  lookupMember: (
    objectName: string,
    propName: string,
  ) => { found: true; value: StaticPrimitive } | { found: false };
  /**
   * Computed member on a known static object literal: `icons[name]`.
   * `missing` means the object is known but the key is absent (nullish).
   */
  lookupComputedMember?: (
    objectName: string,
    key: string,
  ) =>
    | { kind: "value"; value: StaticPrimitive }
    | { kind: "missing" }
    | { kind: "unknown-object" };
};

export function extractStaticPrimitive(
  node: Node | null | undefined,
  env?: StaticPropEnv,
): StaticExtraction {
  if (!node) {
    return { ok: false, reason: "missing-expression" };
  }

  switch (node.type) {
    case "StringLiteral":
      return { ok: true, value: node.value };
    case "NumericLiteral":
      return { ok: true, value: node.value };
    case "BooleanLiteral":
      return { ok: true, value: node.value };
    case "NullLiteral":
      return { ok: true, value: null };
    case "TemplateLiteral":
      return extractStaticTemplate(node, env);
    case "UnaryExpression":
      if (node.operator === "-" && node.argument.type === "NumericLiteral") {
        return { ok: true, value: -node.argument.value };
      }
      if (node.operator === "!") {
        const inner = extractStaticPrimitive(node.argument, env);
        if (inner.ok && typeof inner.value === "boolean") {
          return { ok: true, value: !inner.value };
        }
        if (inner.ok && (inner.value === null || inner.value === 0 || inner.value === "")) {
          return { ok: true, value: true };
        }
        if (inner.ok) {
          return { ok: true, value: !inner.value };
        }
      }
      return { ok: false, reason: "non-static-unary" };
    case "Identifier":
      if (node.name === "undefined") {
        return { ok: true, value: null };
      }
      if (env) {
        const bound = env.lookupIdentifier(node.name);
        if (bound.found) {
          return { ok: true, value: bound.value };
        }
      }
      return { ok: false, reason: `dynamic-identifier:${node.name}` };
    case "MemberExpression":
      return extractStaticMember(node, env);
    case "LogicalExpression":
      if (node.operator === "??") {
        const left = extractStaticPrimitive(node.left, env);
        if (!left.ok) {
          return left;
        }
        if (left.value === null) {
          return extractStaticPrimitive(node.right, env);
        }
        return left;
      }
      return { ok: false, reason: `unsupported-logical:${node.operator}` };
    case "JSXExpressionContainer":
      return extractStaticPrimitive(node.expression, env);
    default:
      return { ok: false, reason: `unsupported-expression:${node.type}` };
  }
}

function extractStaticMember(
  node: import("@babel/types").MemberExpression,
  env?: StaticPropEnv,
): StaticExtraction {
  if (node.object.type !== "Identifier") {
    return { ok: false, reason: "dynamic-member-expression" };
  }
  const objectName = node.object.name;

  // obj.prop (non-computed) — prop scopes first, then static object literals
  if (!node.computed && node.property.type === "Identifier" && env) {
    const bound = env.lookupMember(objectName, node.property.name);
    if (bound.found) {
      return { ok: true, value: bound.value };
    }
    if (env.lookupComputedMember) {
      const lit = env.lookupComputedMember(objectName, node.property.name);
      if (lit.kind === "value") {
        return { ok: true, value: lit.value };
      }
      if (lit.kind === "missing") {
        return { ok: true, value: null };
      }
    }
  }

  // obj[key] / obj["key"] (computed) — static object lookup only
  if (node.computed && env?.lookupComputedMember) {
    const keyPrim = extractStaticPrimitive(node.property, env);
    if (!keyPrim.ok) {
      return { ok: false, reason: "dynamic-computed-key" };
    }
    if (typeof keyPrim.value !== "string" && typeof keyPrim.value !== "number") {
      return { ok: false, reason: "non-string-computed-key" };
    }
    const key = String(keyPrim.value);
    const lit = env.lookupComputedMember(objectName, key);
    if (lit.kind === "value") {
      return { ok: true, value: lit.value };
    }
    if (lit.kind === "missing") {
      return { ok: true, value: null };
    }
  }

  return { ok: false, reason: "dynamic-member-expression" };
}

function extractStaticTemplate(
  node: TemplateLiteral,
  env?: StaticPropEnv,
): StaticExtraction {
  if (node.expressions.length === 0) {
    return { ok: true, value: node.quasis.map((q) => q.value.cooked ?? q.value.raw).join("") };
  }
  // Only allow static primitive interpolations.
  let out = "";
  for (let i = 0; i < node.quasis.length; i += 1) {
    out += node.quasis[i]?.value.cooked ?? node.quasis[i]?.value.raw ?? "";
    const expr = node.expressions[i];
    if (!expr) {
      continue;
    }
    const part = extractStaticPrimitive(expr, env);
    if (!part.ok) {
      return { ok: false, reason: "dynamic-template" };
    }
    out += part.value == null ? "" : String(part.value);
  }
  return { ok: true, value: out };
}

/** Reconstruct a CSS-ish inline style string from a static object expression. */
export function inlineStyleObjectToRaw(node: ObjectExpression): string | undefined {
  const parts: string[] = [];
  for (const prop of node.properties) {
    if (prop.type !== "ObjectProperty" || prop.computed) {
      return undefined;
    }
    let key: string | undefined;
    if (prop.key.type === "Identifier") {
      key = prop.key.name;
    } else if (prop.key.type === "StringLiteral") {
      key = prop.key.value;
    } else {
      return undefined;
    }
    const value = extractStaticPrimitive(prop.value as Expression);
    if (!value.ok || value.value == null) {
      return undefined;
    }
    const cssKey = key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    parts.push(`${cssKey}:${String(value.value)}`);
  }
  return parts.join(";");
}

export function isJsxChildNode(
  node: Node,
): node is JSXElement | JSXFragment | JSXExpressionContainer {
  return (
    node.type === "JSXElement" ||
    node.type === "JSXFragment" ||
    node.type === "JSXExpressionContainer"
  );
}

export type AttrBag = {
  attributes: Record<string, string>;
  classNames: string[];
  inlineStyleRaw?: string;
  dynamicAttrReasons: string[];
};

export function collectJsxAttributes(
  attributes: Array<JSXAttribute | JSXSpreadAttribute>,
  env?: StaticPropEnv,
): AttrBag {
  const result: AttrBag = {
    attributes: {},
    classNames: [],
    dynamicAttrReasons: [],
  };

  for (const attr of attributes) {
    if (attr.type === "JSXSpreadAttribute") {
      result.dynamicAttrReasons.push("jsx-spread-attribute");
      continue;
    }

    const name =
      attr.name.type === "JSXIdentifier"
        ? attr.name.name
        : `${attr.name.namespace.name}:${attr.name.name.name}`;

    if (attr.value == null) {
      // boolean attribute
      result.attributes[name] = "true";
      continue;
    }

    if (attr.value.type === "StringLiteral") {
      assignAttr(result, name, attr.value.value);
      continue;
    }

    if (attr.value.type === "JSXExpressionContainer") {
      const expr = attr.value.expression;
      if (expr.type === "JSXEmptyExpression") {
        continue;
      }

      if (name === "style" && expr.type === "ObjectExpression") {
        const raw = inlineStyleObjectToRaw(expr);
        if (raw != null) {
          result.inlineStyleRaw = raw;
        } else {
          result.dynamicAttrReasons.push("dynamic-style-object");
        }
        continue;
      }

      if (name === "className" || name === "class") {
        const prim = extractStaticPrimitive(expr, env);
        if (prim.ok && typeof prim.value === "string") {
          assignAttr(result, "className", prim.value);
        } else if (
          expr.type === "ArrayExpression" &&
          expr.elements.every(
            (el) =>
              el &&
              (el.type === "StringLiteral" ||
                (el.type === "TemplateLiteral" && el.expressions.length === 0)),
          )
        ) {
          const parts: string[] = [];
          for (const el of expr.elements) {
            if (!el) continue;
            const p = extractStaticPrimitive(el, env);
            if (p.ok && typeof p.value === "string") {
              parts.push(p.value);
            }
          }
          assignAttr(result, "className", parts.join(" "));
        } else {
          result.dynamicAttrReasons.push("dynamic-className");
        }
        continue;
      }

      const prim = extractStaticPrimitive(expr, env);
      if (prim.ok) {
        if (prim.value == null) {
          continue;
        }
        assignAttr(result, name, String(prim.value));
      } else {
        result.dynamicAttrReasons.push(`dynamic-attr:${name}`);
      }
      continue;
    }
  }

  return result;
}

function assignAttr(result: AttrBag, name: string, value: string): void {
  if (name === "className" || name === "class") {
    const tokens = value
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);
    result.classNames.push(...tokens);
    result.attributes.className = tokens.join(" ");
    return;
  }
  result.attributes[name] = value;
}

/** Static boolean test for conditionals — never executes code. */
export function extractStaticBoolean(
  node: Node,
  env?: StaticPropEnv,
): { ok: true; value: boolean } | { ok: false } {
  const prim = extractStaticPrimitive(node, env);
  if (!prim.ok) {
    return { ok: false };
  }
  return { ok: true, value: Boolean(prim.value) };
}
