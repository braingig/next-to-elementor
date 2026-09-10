import type {
  JSXElement,
  JSXFragment,
  JSXText,
  Node,
} from "@babel/types";
import {
  collectJsxAttributes,
  extractStaticPrimitive,
  type StaticPropEnv,
} from "./static-value";

/** SVG / HTML void-like tags that should self-close when empty. */
const SELF_CLOSING = new Set([
  "path",
  "circle",
  "ellipse",
  "line",
  "polygon",
  "polyline",
  "rect",
  "use",
  "stop",
  "br",
  "hr",
  "img",
  "input",
]);

/**
 * Serialize a static JSX element tree to HTML markup.
 * Returns null if any dynamic expression prevents faithful serialization.
 * Never evaluates user code.
 */
export function serializeStaticJsxElement(
  node: JSXElement,
  env?: StaticPropEnv,
): string | null {
  const nameNode = node.openingElement.name;
  if (nameNode.type !== "JSXIdentifier") {
    return null;
  }
  const tag = nameNode.name.toLowerCase();
  const attrs = collectJsxAttributes(node.openingElement.attributes, env);
  if (attrs.dynamicAttrReasons.length > 0) {
    return null;
  }

  const attrParts: string[] = [];
  const seen = new Set<string>();
  for (const key of Object.keys(attrs.attributes).sort()) {
    const raw = attrs.attributes[key]!;
    const htmlKey = key === "className" ? "class" : key;
    if (seen.has(htmlKey)) continue;
    seen.add(htmlKey);
    attrParts.push(` ${htmlKey}="${escapeXml(raw)}"`);
  }
  if (attrs.classNames.length > 0 && !seen.has("class")) {
    attrParts.push(` class="${escapeXml(attrs.classNames.join(" "))}"`);
  }

  const inner = serializeStaticJsxChildren(node.children, env);
  if (inner === null) return null;

  if (
    node.openingElement.selfClosing ||
    (SELF_CLOSING.has(tag) && inner.length === 0)
  ) {
    return `<${tag}${attrParts.join("")} />`;
  }

  return `<${tag}${attrParts.join("")}>${inner}</${tag}>`;
}

function serializeStaticJsxChildren(
  children: Node[],
  env?: StaticPropEnv,
): string | null {
  let out = "";
  for (const child of children) {
    if (child.type === "JSXText") {
      out += (child as JSXText).value;
      continue;
    }
    if (child.type === "JSXExpressionContainer") {
      const expr = child.expression;
      if (expr.type === "JSXEmptyExpression") continue;
      const prim = extractStaticPrimitive(expr, env);
      if (!prim.ok) return null;
      out += prim.value == null ? "" : escapeXml(String(prim.value));
      continue;
    }
    if (child.type === "JSXElement") {
      const html = serializeStaticJsxElement(child, env);
      if (html === null) return null;
      out += html;
      continue;
    }
    if (child.type === "JSXFragment") {
      const html = serializeStaticJsxFragment(child, env);
      if (html === null) return null;
      out += html;
      continue;
    }
    return null;
  }
  return out;
}

function serializeStaticJsxFragment(
  node: JSXFragment,
  env?: StaticPropEnv,
): string | null {
  return serializeStaticJsxChildren(node.children, env);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
