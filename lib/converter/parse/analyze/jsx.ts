import type {
  Expression,
  JSXElement,
  JSXFragment,
  JSXText,
  Node,
} from "@babel/types";
import type { IrNode } from "../../ir/schema";
import {
  addDiagnostic,
  emptyProvenance,
  locFromBabel,
  lookupJsxChildren,
  lookupJsxChildrenMember,
  lookupOpaqueIdentifier,
  lookupOpaqueObjectIdentifier,
  lookupPropBinding,
  lookupPropsMember,
  lookupStaticObjectField,
  lookupStaticPrimitiveBinding,
  nextId,
  uncertainNode,
  unsupportedNode,
  type AnalyzerContext,
} from "./context";
import {
  attachJsxChildrenToScope,
  bindStaticPropsFromUsage,
} from "./bind-props";
import {
  isFragmentName,
  isIntrinsicHtmlTag,
  mapHtmlTagToKind,
} from "./map-element";
import {
  collectJsxAttributes,
  extractStaticBoolean,
  extractStaticPrimitive,
  type StaticPropEnv,
} from "./static-value";
import { serializeStaticJsxElement } from "./serialize-jsx";
import { convertStaticArrayMap } from "./static-array-map";

function propEnvFromCtx(ctx: AnalyzerContext): StaticPropEnv {
  return {
    lookupIdentifier: (name) => {
      const prop = lookupPropBinding(ctx, name);
      if (prop.found) return prop;
      return lookupStaticPrimitiveBinding(ctx, name);
    },
    lookupMember: (objectName, propName) =>
      lookupPropsMember(ctx, objectName, propName),
    lookupComputedMember: (objectName, key) =>
      lookupStaticObjectField(ctx, objectName, key),
  };
}

function getJsxElementName(node: JSXElement): string | null {
  const name = node.openingElement.name;
  if (name.type === "JSXIdentifier") {
    return name.name;
  }
  if (name.type === "JSXMemberExpression") {
    const parts: string[] = [];
    let cur: typeof name | import("@babel/types").JSXIdentifier = name;
    while (cur.type === "JSXMemberExpression") {
      parts.unshift(cur.property.name);
      cur = cur.object;
    }
    if (cur.type === "JSXIdentifier") {
      parts.unshift(cur.name);
    }
    return parts.join(".");
  }
  return null;
}

/**
 * Resolve map opaque component refs: <item.icon /> / <Icon /> → ShieldCheck
 * when the Identifier is a known local/stub component. Static only — no import execution.
 */
function resolveOpaqueComponentJsxName(
  ctx: AnalyzerContext,
  name: string,
): string | null {
  if (!name.includes(".")) {
    const fromLocal = lookupOpaqueIdentifier(ctx, name);
    if (fromLocal && ctx.localComponents.has(fromLocal)) {
      return fromLocal;
    }
    return null;
  }
  // Only simple object.prop (Festive: item.icon / s.icon).
  const dot = name.indexOf(".");
  if (dot <= 0 || name.indexOf(".", dot + 1) !== -1) {
    return null;
  }
  const objectName = name.slice(0, dot);
  const propName = name.slice(dot + 1);
  const fromMember = lookupOpaqueObjectIdentifier(ctx, objectName, propName);
  if (fromMember && ctx.localComponents.has(fromMember)) {
    return fromMember;
  }
  return null;
}

function textFromJsxChildren(
  children: Node[],
  env?: StaticPropEnv,
): { text: string; hasDynamic: boolean } {
  let text = "";
  let hasDynamic = false;
  for (const child of children) {
    if (child.type === "JSXText") {
      text += decodeJsxText(child);
      continue;
    }
    if (child.type === "JSXExpressionContainer") {
      const expr = child.expression;
      if (expr.type === "JSXEmptyExpression") continue;
      const prim = extractStaticPrimitive(expr, env);
      if (prim.ok) {
        text += prim.value == null ? "" : String(prim.value);
      } else {
        hasDynamic = true;
      }
      continue;
    }
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      hasDynamic = true;
    }
  }
  return { text: collapseWs(text), hasDynamic };
}

function decodeJsxText(node: JSXText): string {
  return node.value;
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function hasElementChildren(children: Node[]): boolean {
  return children.some(
    (c) => c.type === "JSXElement" || c.type === "JSXFragment",
  );
}

export function convertJsxRoot(
  ctx: AnalyzerContext,
  node: Expression | JSXElement | JSXFragment,
): IrNode {
  return convertExpression(ctx, node);
}

function convertExpression(ctx: AnalyzerContext, node: Node): IrNode {
  if (node.type === "JSXElement") {
    return convertJsxElement(ctx, node);
  }
  if (node.type === "JSXFragment") {
    return convertJsxFragment(ctx, node);
  }
  if (node.type === "ParenthesizedExpression") {
    return convertExpression(ctx, node.expression);
  }
  if (node.type === "ConditionalExpression") {
    return convertConditional(ctx, node);
  }
  if (node.type === "LogicalExpression" && node.operator === "&&") {
    return convertLogicalAnd(ctx, node);
  }
  if (node.type === "LogicalExpression" && node.operator === "||") {
    const leftBool = extractStaticBoolean(node.left, propEnvFromCtx(ctx));
    if (leftBool.ok) {
      return convertExpression(ctx, leftBool.value ? node.left : node.right);
    }
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-content",
      message: "Dynamic logical || expression cannot be safely resolved statically.",
      originalSummary: "||",
      loc: locFromBabel(node),
    });
  }
  if (node.type === "LogicalExpression" && node.operator === "??") {
    // Prefer primitive resolution (object lookup + fallback); otherwise unsupported.
    const prim = extractStaticPrimitive(node, propEnvFromCtx(ctx));
    if (prim.ok) {
      return {
        id: nextId(ctx),
        kind: "text",
        status: "ok",
        props: { text: prim.value == null ? "" : String(prim.value) },
        style: {},
        provenance: emptyProvenance({
          sourcePath: ctx.sourcePath,
          loc: locFromBabel(node),
        }),
        notes: ["static-nullish-coalesce"],
        children: [],
      };
    }
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-content",
      message:
        "Nullish coalescing (??) could not be resolved statically (dynamic left or fallback).",
      originalSummary: "a ?? b",
      loc: locFromBabel(node),
    });
  }
  if (node.type === "Identifier") {
    const kids = lookupJsxChildren(ctx, node.name);
    if (kids) {
      const childIr = convertChildren(ctx, kids);
      if (childIr.length === 1) {
        return childIr[0]!;
      }
      return {
        id: nextId(ctx),
        kind: "group",
        status: "ok",
        props: {},
        style: {},
        provenance: emptyProvenance({
          sourcePath: ctx.sourcePath,
          loc: locFromBabel(node),
        }),
        notes: ["jsx-children-prop"],
        children: childIr,
      };
    }
  }
  if (
    node.type === "MemberExpression" &&
    !node.computed &&
    node.object.type === "Identifier" &&
    node.property.type === "Identifier"
  ) {
    const kids = lookupJsxChildrenMember(
      ctx,
      node.object.name,
      node.property.name,
    );
    if (kids) {
      const childIr = convertChildren(ctx, kids);
      if (childIr.length === 1) {
        return childIr[0]!;
      }
      return {
        id: nextId(ctx),
        kind: "group",
        status: "ok",
        props: {},
        style: {},
        provenance: emptyProvenance({
          sourcePath: ctx.sourcePath,
          loc: locFromBabel(node),
        }),
        notes: ["jsx-children-prop"],
        children: childIr,
      };
    }
  }
  if (node.type === "ArrayExpression") {
    return convertArrayExpression(ctx, node);
  }
  if (node.type === "CallExpression") {
    // Static Array.map(...) expansion (Phase E) — never executes the callback.
    const mapped = convertStaticArrayMap(ctx, node, convertExpression);
    if (mapped) {
      return mapped;
    }
    return unsupportedNode(ctx, {
      reasonCode: "dynamic-content",
      message: "Function call expressions are not evaluated (static analysis only).",
      originalSummary: node.callee.type,
      loc: locFromBabel(node),
    });
  }

  return unsupportedNode(ctx, {
    reasonCode: "other",
    message: `Unsupported JSX/expression node type: ${node.type}`,
    originalSummary: node.type,
    loc: locFromBabel(node),
  });
}

function convertConditional(
  ctx: AnalyzerContext,
  node: import("@babel/types").ConditionalExpression,
): IrNode {
  const test = extractStaticBoolean(node.test, propEnvFromCtx(ctx));
  if (test.ok) {
    return convertExpression(ctx, test.value ? node.consequent : node.alternate);
  }
  return unsupportedNode(ctx, {
    reasonCode: "dynamic-content",
    message:
      "Conditional JSX could not be resolved because the test expression is not a static boolean.",
    originalSummary: "a ? b : c",
    loc: locFromBabel(node),
  });
}

function convertLogicalAnd(
  ctx: AnalyzerContext,
  node: import("@babel/types").LogicalExpression,
): IrNode {
  const left = extractStaticBoolean(node.left, propEnvFromCtx(ctx));
  if (left.ok) {
    if (!left.value) {
      // Render nothing — represent as empty group
      return {
        id: nextId(ctx),
        kind: "group",
        status: "ok",
        props: {},
        style: {},
        provenance: emptyProvenance({
          sourcePath: ctx.sourcePath,
          loc: locFromBabel(node),
        }),
        notes: ["static-false-conditional"],
        children: [],
      };
    }
    return convertExpression(ctx, node.right);
  }
  return unsupportedNode(ctx, {
    reasonCode: "dynamic-content",
    message:
      "Logical && JSX could not be resolved because the left operand is not a static boolean.",
    originalSummary: "cond && <JSX />",
    loc: locFromBabel(node),
  });
}

function convertArrayExpression(
  ctx: AnalyzerContext,
  node: import("@babel/types").ArrayExpression,
): IrNode {
  const children: IrNode[] = [];
  for (const el of node.elements) {
    if (!el) continue;
    if (el.type === "SpreadElement") {
      children.push(
        unsupportedNode(ctx, {
          reasonCode: "dynamic-children",
          message: "Spread elements in JSX arrays are not expanded.",
          loc: locFromBabel(el),
        }),
      );
      continue;
    }
    children.push(convertExpression(ctx, el));
  }
  return {
    id: nextId(ctx),
    kind: "group",
    status: "ok",
    props: {},
    style: {},
    provenance: emptyProvenance({
      sourcePath: ctx.sourcePath,
      loc: locFromBabel(node),
      componentName: "ArrayExpression",
    }),
    notes: ["static-jsx-array"],
    children,
  };
}

function convertJsxFragment(ctx: AnalyzerContext, node: JSXFragment): IrNode {
  const children = convertChildren(ctx, node.children);
  return {
    id: nextId(ctx),
    kind: "group",
    status: "ok",
    props: {},
    style: {},
    provenance: emptyProvenance({
      sourcePath: ctx.sourcePath,
      loc: locFromBabel(node),
      componentName: "Fragment",
    }),
    notes: ["jsx-fragment"],
    children,
  };
}

function convertChildren(
  ctx: AnalyzerContext,
  children: ReadonlyArray<Node>,
): IrNode[] {
  const out: IrNode[] = [];
  let pendingText = "";

  const flushText = (loc?: IrNode["provenance"]) => {
    const text = collapseWs(pendingText);
    pendingText = "";
    if (!text) return;
    out.push({
      id: nextId(ctx),
      kind: "text",
      status: "ok",
      props: { text },
      style: {},
      provenance: emptyProvenance({
        sourcePath: ctx.sourcePath,
        ...loc,
      }),
      notes: [],
      children: [],
    });
  };

  for (const child of children) {
    if (child.type === "JSXText") {
      pendingText += child.value;
      continue;
    }
    if (child.type === "JSXExpressionContainer") {
      const expr = child.expression;
      if (expr.type === "JSXEmptyExpression") continue;
      const prim = extractStaticPrimitive(expr, propEnvFromCtx(ctx));
      if (prim.ok) {
        pendingText += prim.value == null ? "" : String(prim.value);
        continue;
      }
      flushText();
      // Non-primitive expressions (conditionals, arrays, calls, …) go through
      // the full static expression converter — never evaluated.
      out.push(convertExpression(ctx, expr));
      continue;
    }
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      flushText();
      out.push(convertExpression(ctx, child));
      continue;
    }
    if (child.type === "JSXSpreadChild") {
      flushText();
      out.push(
        unsupportedNode(ctx, {
          reasonCode: "dynamic-children",
          message: "JSX spread children are not supported.",
          loc: locFromBabel(child),
        }),
      );
    }
  }
  flushText();
  return out;
}

function convertJsxElement(ctx: AnalyzerContext, node: JSXElement): IrNode {
  const name = getJsxElementName(node);
  const loc = locFromBabel(node);

  if (!name) {
    return unsupportedNode(ctx, {
      reasonCode: "parse-error",
      message: "Unable to resolve JSX element name.",
      loc,
    });
  }

  if (isFragmentName(name) || name === "React.Fragment") {
    return {
      id: nextId(ctx),
      kind: "group",
      status: "ok",
      props: {},
      style: {},
      provenance: emptyProvenance({
        sourcePath: ctx.sourcePath,
        loc,
        componentName: name,
      }),
      notes: ["jsx-fragment-component"],
      children: convertChildren(ctx, node.children),
    };
  }

  // Static map opaque refs: <item.icon /> → ShieldCheck when stub/local exists.
  const opaqueComponent = resolveOpaqueComponentJsxName(ctx, name);
  if (opaqueComponent) {
    return convertCustomComponent(ctx, node, opaqueComponent);
  }

  // Custom components (PascalCase / member except React.Fragment)
  if (!isIntrinsicHtmlTag(name)) {
    return convertCustomComponent(ctx, node, name);
  }

  const attrs = collectJsxAttributes(
    node.openingElement.attributes,
    propEnvFromCtx(ctx),
  );
  const childrenNodes = node.children;
  const isEmpty =
    !hasElementChildren(childrenNodes) &&
    collapseWs(childrenNodes.map((c) => (c.type === "JSXText" ? c.value : "")).join("")) ===
      "";
  const mapped = mapHtmlTagToKind(name, {
    hasBlockChildren: hasElementChildren(childrenNodes),
    isEmpty,
    attributes: {
      ...attrs.attributes,
      ...(attrs.inlineStyleRaw ? { style: attrs.inlineStyleRaw } : {}),
    },
  });

  const provenance = emptyProvenance({
    sourcePath: ctx.sourcePath,
    loc,
    htmlTag: name,
    classNames: attrs.classNames,
    attributes: Object.fromEntries(
      Object.entries(attrs.attributes).filter(([k]) => k !== "className" && k !== "class"),
    ),
    ...(attrs.inlineStyleRaw ? { inlineStyleRaw: attrs.inlineStyleRaw } : {}),
  });

  for (const reason of attrs.dynamicAttrReasons) {
    addDiagnostic(ctx, {
      severity: "warning",
      code: "dynamic-content",
      message: `Non-static JSX attribute skipped: ${reason}`,
      loc,
    });
  }

  const id = nextId(ctx);
  const needsChildTree =
    mapped.kind === "container" ||
    mapped.kind === "group" ||
    mapped.kind === "list" ||
    mapped.kind === "list-item" ||
    mapped.kind === "html-embed" ||
    mapped.kind === "button" ||
    mapped.kind === "link";
  // SVG/icon: do not expand <path> etc. into separate IR nodes — serialize markup instead.

  const childIr = needsChildTree ? convertChildren(ctx, childrenNodes) : [];

  switch (mapped.kind) {
    case "heading": {
      const { text, hasDynamic } = textFromJsxChildren(childrenNodes, propEnvFromCtx(ctx));
      if (hasElementChildren(childrenNodes)) {
        const nestedChildren = convertChildren(ctx, childrenNodes);
        return uncertainNode(
          ctx,
          {
            id,
            kind: "container",
            status: "ok",
            props: { as: name },
            style: {},
            provenance,
            notes: ["heading-with-nested-elements"],
            children: nestedChildren,
          },
          "Heading contains nested elements; mapped as container with uncertain semantics.",
          "semantic-ambiguous",
        );
      }
      if (hasDynamic) {
        // Preserve static fragments as diagnostics/children — do not silently drop dynamics.
        const nestedChildren = convertChildren(ctx, childrenNodes);
        return {
          id,
          kind: "group",
          status: "ok",
          props: { as: name },
          style: {},
          provenance,
          notes: ["heading-with-dynamic-content"],
          children: nestedChildren,
        };
      }
      return {
        id,
        kind: "heading",
        status: "ok",
        props: {
          level: mapped.headingLevel ?? 1,
          text: text || "",
        },
        style: {},
        provenance,
        notes: [],
        children: [],
      };
    }
    case "text": {
      const { text, hasDynamic } = textFromJsxChildren(childrenNodes, propEnvFromCtx(ctx));
      if (hasElementChildren(childrenNodes) || hasDynamic) {
        const nestedChildren = convertChildren(ctx, childrenNodes);
        return {
          id,
          kind: "group",
          status: "ok",
          props: { as: name },
          style: {},
          provenance,
          notes: ["text-with-nested-or-dynamic-children"],
          children: nestedChildren,
        };
      }
      return {
        id,
        kind: "text",
        status: "ok",
        props: { text },
        style: {},
        provenance,
        notes: mapped.notes ? [mapped.notes] : [],
        children: [],
      };
    }
    case "image": {
      const src = attrs.attributes.src ?? "";
      const alt = attrs.attributes.alt ?? "";
      if (!src) {
        return unsupportedNode(ctx, {
          reasonCode: "asset-unresolved",
          message: "Image is missing a static src attribute.",
          provenance,
          loc,
        });
      }
      const width = attrs.attributes.width
        ? Number(attrs.attributes.width)
        : undefined;
      const height = attrs.attributes.height
        ? Number(attrs.attributes.height)
        : undefined;
      return {
        id,
        kind: "image",
        status: "ok",
        props: {
          src,
          alt,
          ...(width && !Number.isNaN(width) ? { width } : {}),
          ...(height && !Number.isNaN(height) ? { height } : {}),
        },
        style: {},
        provenance,
        notes: [],
        children: [],
      };
    }
    case "button": {
      const { text } = textFromJsxChildren(childrenNodes, propEnvFromCtx(ctx));
      const href = attrs.attributes.href;
      return {
        id,
        kind: "button",
        status: "ok",
        props: {
          text: text || attrs.attributes["aria-label"] || "",
          ...(href ? { href, type: "link" as const } : { type: "button" as const }),
          ...(attrs.attributes.target ? { target: attrs.attributes.target } : {}),
          ...(attrs.attributes.rel ? { rel: attrs.attributes.rel } : {}),
        },
        style: {},
        provenance,
        notes: [],
        children: childIr.length && hasElementChildren(childrenNodes) ? childIr : [],
      };
    }
    case "link": {
      const { text } = textFromJsxChildren(childrenNodes, propEnvFromCtx(ctx));
      const href = attrs.attributes.href;
      if (!href) {
        return uncertainNode(
          ctx,
          {
            id,
            kind: "link",
            status: "ok",
            props: { href: "#", text },
            style: {},
            provenance,
            notes: ["missing-href"],
            children: [],
          },
          "Anchor is missing a static href; placeholder used.",
          "semantic-ambiguous",
        );
      }
      return {
        id,
        kind: "link",
        status: "ok",
        props: {
          href,
          ...(text ? { text } : {}),
          ...(attrs.attributes.target ? { target: attrs.attributes.target } : {}),
          ...(attrs.attributes.rel ? { rel: attrs.attributes.rel } : {}),
        },
        style: {},
        provenance,
        notes: [],
        children: hasElementChildren(childrenNodes) ? childIr : [],
      };
    }
    case "divider":
      return {
        id,
        kind: "divider",
        status: "ok",
        props: {},
        style: {},
        provenance,
        notes: [],
        children: [],
      };
    case "spacer":
      return {
        id,
        kind: "spacer",
        status: "ok",
        props: { axis: "y" },
        style: {},
        provenance,
        notes: ["aria-hidden-empty-box"],
        children: [],
      };
    case "icon": {
      const svgMarkup = serializeStaticJsxElement(node, propEnvFromCtx(ctx));
      if (svgMarkup == null) {
        return unsupportedNode(ctx, {
          reasonCode: "svg-complex",
          message:
            "SVG contains dynamic or non-static content and cannot be preserved accurately.",
          provenance,
          loc,
        });
      }
      const named = attrs.attributes["data-icon"];
      return uncertainNode(
        ctx,
        {
          id,
          kind: "icon",
          status: "ok",
          props: {
            ...(named ? { name: named } : {}),
            svg: svgMarkup,
          },
          style: {},
          provenance,
          notes: named ? ["svg-named-icon"] : ["svg-as-custom-html"],
          children: [],
        },
        named
          ? "SVG provides a named icon hint; native Icon may be used when the name is recognized."
          : "Inline SVG preserved as markup for custom HTML fallback (no invented icon name).",
        "semantic-ambiguous",
      );
    }
    case "list": {
      return {
        id,
        kind: "list",
        status: "ok",
        props: { listType: name === "ol" ? "ol" : "ul" },
        style: {},
        provenance,
        notes: [],
        children: childIr,
      };
    }
    case "list-item": {
      const { text } = textFromJsxChildren(childrenNodes, propEnvFromCtx(ctx));
      return {
        id,
        kind: "list-item",
        status: "ok",
        props: { ...(text ? { text } : {}) },
        style: {},
        provenance,
        notes: [],
        children: hasElementChildren(childrenNodes) ? childIr : [],
      };
    }
    case "html-embed": {
      return uncertainNode(
        ctx,
        {
          id,
          kind: "html-embed",
          status: "ok",
          props: { html: `<${name}></${name}>` },
          style: {},
          provenance,
          notes: mapped.notes ? [mapped.notes] : [],
          children: childIr,
        },
        `HTML tag <${name}> has no dedicated IR kind; preserved as html-embed.`,
        "semantic-ambiguous",
      );
    }
    case "group":
      return {
        id,
        kind: "group",
        status: "ok",
        props: { as: name },
        style: {},
        provenance,
        notes: [],
        children: childIr.length
          ? childIr
          : (() => {
              const { text } = textFromJsxChildren(childrenNodes, propEnvFromCtx(ctx));
              return text
                ? [
                    {
                      id: nextId(ctx),
                      kind: "text" as const,
                      status: "ok" as const,
                      props: { text },
                      style: {},
                      provenance: emptyProvenance({ sourcePath: ctx.sourcePath }),
                      notes: [],
                      children: [],
                    },
                  ]
                : [];
            })(),
      };
    case "container":
    default:
      return {
        id,
        kind: "container",
        status: "ok",
        props: { as: name },
        style: {},
        provenance,
        notes: [],
        children: childIr,
      };
  }
}

/** Max nested unknown-component passthrough wrappers (Accordion → Item → …). */
export const MAX_UNKNOWN_PASSTHROUGH_DEPTH = 32;

function hasPassthroughChildren(node: JSXElement): boolean {
  return node.children.some((child) => {
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      return true;
    }
    if (child.type === "JSXExpressionContainer") {
      return child.expression.type !== "JSXEmptyExpression";
    }
    if (child.type === "JSXText") {
      return collapseWs(child.value).length > 0;
    }
    if (child.type === "JSXSpreadChild") {
      return true;
    }
    return false;
  });
}

/**
 * When a custom component cannot be inlined, preserve usage-site children as a
 * generic container. Does not emulate component runtime behavior.
 */
function passthroughUnknownComponentChildren(
  ctx: AnalyzerContext,
  node: JSXElement,
  name: string,
  loc: ReturnType<typeof locFromBabel>,
): IrNode {
  if (ctx.passthroughDepth >= MAX_UNKNOWN_PASSTHROUGH_DEPTH) {
    return unsupportedNode(ctx, {
      reasonCode: "unknown-component",
      message: `Unknown component <${name} /> children passthrough refused: depth exceeded ${MAX_UNKNOWN_PASSTHROUGH_DEPTH}.`,
      originalSummary: `<${name} />`,
      provenance: { componentName: name, loc },
      loc,
    });
  }

  // className only — do not copy arbitrary Radix/DOM props into Elementor settings.
  const attrs = collectJsxAttributes(
    node.openingElement.attributes,
    propEnvFromCtx(ctx),
  );

  const id = nextId(ctx);
  ctx.passthroughDepth += 1;
  let childIr: IrNode[];
  try {
    childIr = convertChildren(ctx, node.children);
  } finally {
    ctx.passthroughDepth -= 1;
  }

  addDiagnostic(ctx, {
    severity: "info",
    code: "unknown-component-passthrough",
    message: `Unknown component <${name} /> preserved as a generic container; children converted statically (runtime behavior not emulated).`,
    nodeId: id,
    loc,
  });

  return {
    id,
    kind: "container",
    status: "ok",
    props: { as: "div" },
    style: {},
    provenance: emptyProvenance({
      sourcePath: ctx.sourcePath,
      componentName: name,
      classNames: attrs.classNames,
      attributes: {},
      loc,
    }),
    notes: [`unknown-component-passthrough:${name}`],
    children: childIr,
  };
}

function convertCustomComponent(
  ctx: AnalyzerContext,
  node: JSXElement,
  name: string,
): IrNode {
  const loc = locFromBabel(node);
  const local = ctx.localComponents.get(name.split(".")[0] ?? name);

  // Member components like Foo.Bar without local def
  if (name.includes(".") && !ctx.localComponents.has(name)) {
    if (hasPassthroughChildren(node)) {
      return passthroughUnknownComponentChildren(ctx, node, name, loc);
    }
    return unsupportedNode(ctx, {
      reasonCode: "unknown-component",
      message: `Unknown member component <${name} /> cannot be analyzed without its implementation.`,
      originalSummary: `<${name} />`,
      provenance: { componentName: name, loc },
      loc,
    });
  }

  if (local && ctx.inlineDepth < 5) {
    // Static structural inline + static prop substitution — no code execution.
    const bound = bindStaticPropsFromUsage({
      componentName: name,
      paramBinding: local.paramBinding,
      attributes: node.openingElement.attributes,
      resolveOuter: (n) => extractStaticPrimitive(n, propEnvFromCtx(ctx)),
    });
    for (const d of bound.diagnostics) {
      addDiagnostic(ctx, { ...d, loc });
    }

    const { childrenBound } = attachJsxChildrenToScope({
      scope: bound.scope,
      paramBinding: local.paramBinding,
      usageChildren: node.children,
      resolveOuter: (n) => extractStaticPrimitive(n, propEnvFromCtx(ctx)),
    });

    const attrs = collectJsxAttributes(
      node.openingElement.attributes,
      propEnvFromCtx(ctx),
    );
    ctx.propScopes.push(bound.scope);
    ctx.inlineDepth += 1;
    ctx.inlineComponentStack.push(name.split(".")[0] ?? name);
    let inlined: IrNode;
    try {
      inlined = convertExpression(ctx, local.jsxRoot);
    } finally {
      ctx.inlineComponentStack.pop();
      ctx.inlineDepth -= 1;
      ctx.propScopes.pop();
    }

    const wrapped: IrNode = {
      ...inlined,
      provenance: {
        ...inlined.provenance,
        sourcePath: ctx.sourcePath,
        componentName: name,
        classNames: [
          ...(inlined.provenance?.classNames ?? []),
          ...attrs.classNames,
        ],
        attributes: {
          ...(inlined.provenance?.attributes ?? {}),
          ...Object.fromEntries(
            Object.entries(attrs.attributes).filter(
              ([k]) => k !== "className" && k !== "class",
            ),
          ),
        },
        ...(attrs.inlineStyleRaw
          ? { inlineStyleRaw: attrs.inlineStyleRaw }
          : {}),
        loc,
      },
      notes: [
        ...(inlined.notes ?? []),
        `inlined-local-component:${name}`,
        ...(bound.scope.values.size > 0 || childrenBound
          ? ["static-props-bound"]
          : []),
        ...(childrenBound ? ["jsx-children-bound"] : []),
      ],
    };

    // Append usage children only when the component did not declare/bind children.
    if (node.children.length > 0 && !childrenBound) {
      const usageChildren = convertChildren(ctx, node.children);
      if (wrapped.kind === "container" || wrapped.kind === "group") {
        const withChildren = {
          ...wrapped,
          children: [...wrapped.children, ...usageChildren],
        };
        addDiagnostic(ctx, {
          severity: "info",
          code: "inlined-local-component",
          message: `Inlined same-file component <${name} /> structurally (static analysis only).`,
          nodeId: withChildren.id,
          loc,
        });
        return withChildren;
      }
    }

    addDiagnostic(ctx, {
      severity: "info",
      code: "inlined-local-component",
      message: `Inlined same-file component <${name} /> structurally (static analysis only).`,
      nodeId: wrapped.id,
      loc,
    });
    return wrapped;
  }

  // Inlining failed (no local def, or inline depth exceeded) — passthrough children.
  if (hasPassthroughChildren(node)) {
    return passthroughUnknownComponentChildren(ctx, node, name, loc);
  }

  return unsupportedNode(ctx, {
    reasonCode: "unknown-component",
    message: `Custom component <${name} /> has no analyzable implementation in the supplied source.`,
    originalSummary: `<${name} />`,
    provenance: { componentName: name, loc },
    loc,
  });
}
