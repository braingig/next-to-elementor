/**
 * Static prop binding for local component inlining.
 * Never executes user code — only literal / already-resolved static values.
 */

import type {
  ArrowFunctionExpression,
  FunctionDeclaration,
  FunctionExpression,
  JSXAttribute,
  JSXElement,
  JSXSpreadAttribute,
} from "@babel/types";
import type { IrDiagnostic } from "../../ir/schema";
import type { StaticPrimitive } from "./static-value";
import { extractStaticPrimitive } from "./static-value";
import type { PropScope } from "./context";

type FnLike = FunctionDeclaration | ArrowFunctionExpression | FunctionExpression;

export type ComponentParamBinding =
  | { kind: "none" }
  | {
      kind: "destructured";
      /** JSX prop name → local identifier used in the component body */
      bindings: Array<{ propName: string; localName: string; defaultValue?: StaticPrimitive }>;
    }
  | { kind: "props-object"; objectName: string }
  | { kind: "unsupported" };

/**
 * Analyze the first component parameter for static prop binding.
 * Supports: `({ a, b })`, `({ a: x })`, `(props)`, and static defaults.
 */
export function analyzeComponentParams(fn: FnLike): ComponentParamBinding {
  if (fn.params.length === 0) {
    return { kind: "none" };
  }
  if (fn.params.length > 1) {
    return { kind: "unsupported" };
  }

  const param = fn.params[0]!;

  if (param.type === "Identifier") {
    return { kind: "props-object", objectName: param.name };
  }

  if (param.type === "ObjectPattern") {
    const bindings: Array<{
      propName: string;
      localName: string;
      defaultValue?: StaticPrimitive;
    }> = [];

    for (const prop of param.properties) {
      if (prop.type === "RestElement") {
        return { kind: "unsupported" };
      }
      if (prop.type !== "ObjectProperty" || prop.computed) {
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

      let localName: string | undefined;
      let defaultValue: StaticPrimitive | undefined;

      if (prop.value.type === "Identifier") {
        localName = prop.value.name;
      } else if (prop.value.type === "AssignmentPattern") {
        if (prop.value.left.type !== "Identifier") {
          return { kind: "unsupported" };
        }
        localName = prop.value.left.name;
        const def = extractStaticPrimitive(prop.value.right);
        if (def.ok) {
          defaultValue = def.value;
        }
      } else {
        return { kind: "unsupported" };
      }

      bindings.push({
        propName,
        localName,
        ...(defaultValue !== undefined ? { defaultValue } : {}),
      });
    }

    return { kind: "destructured", bindings };
  }

  return { kind: "unsupported" };
}

export function paramNamesFromBinding(binding: ComponentParamBinding): string[] {
  if (binding.kind === "destructured") {
    return binding.bindings.map((b) => b.localName);
  }
  if (binding.kind === "props-object") {
    return [binding.objectName];
  }
  return [];
}

export type BindStaticPropsResult = {
  scope: PropScope;
  diagnostics: IrDiagnostic[];
};

/**
 * Bind static literal props from a JSX usage site onto a component's parameters.
 */
export function bindStaticPropsFromUsage(args: {
  componentName: string;
  paramBinding: ComponentParamBinding;
  attributes: Array<JSXAttribute | JSXSpreadAttribute>;
  /** Resolve identifiers already in outer prop scopes (nested static pass-through). */
  resolveOuter?: (node: import("@babel/types").Node) => ReturnType<typeof extractStaticPrimitive>;
}): BindStaticPropsResult {
  const diagnostics: IrDiagnostic[] = [];
  const values = new Map<string, StaticPrimitive>();

  const extract = (node: import("@babel/types").Node) =>
    args.resolveOuter
      ? args.resolveOuter(node)
      : extractStaticPrimitive(node);

  let sawSpread = false;
  const usageValues = new Map<string, StaticPrimitive>();
  const dynamicProps: string[] = [];

  for (const attr of args.attributes) {
    if (attr.type === "JSXSpreadAttribute") {
      sawSpread = true;
      diagnostics.push({
        severity: "warning",
        code: "dynamic-prop",
        message: `Spread props on <${args.componentName} /> are not substituted (static analysis only).`,
      });
      continue;
    }

    const propName =
      attr.name.type === "JSXIdentifier"
        ? attr.name.name
        : `${attr.name.namespace.name}:${attr.name.name.name}`;

    if (propName === "children") {
      // JSX children are handled separately by the inliner.
      continue;
    }

    if (attr.value == null) {
      usageValues.set(propName, true);
      continue;
    }

    if (attr.value.type === "StringLiteral") {
      usageValues.set(propName, attr.value.value);
      continue;
    }

    if (attr.value.type === "JSXExpressionContainer") {
      const expr = attr.value.expression;
      if (expr.type === "JSXEmptyExpression") {
        continue;
      }
      const prim = extract(expr);
      if (prim.ok) {
        usageValues.set(propName, prim.value);
      } else {
        dynamicProps.push(propName);
        diagnostics.push({
          severity: "warning",
          code: "dynamic-prop",
          message: `Prop "${propName}" on <${args.componentName} /> is not a static literal and was not substituted (${prim.reason}).`,
        });
      }
      continue;
    }

    dynamicProps.push(propName);
    diagnostics.push({
      severity: "warning",
      code: "dynamic-prop",
      message: `Prop "${propName}" on <${args.componentName} /> could not be statically substituted.`,
    });
  }

  void sawSpread;
  void dynamicProps;

  const binding = args.paramBinding;

  if (binding.kind === "none" || binding.kind === "unsupported") {
    if (binding.kind === "unsupported" && usageValues.size > 0) {
      diagnostics.push({
        severity: "warning",
        code: "dynamic-prop",
        message: `Component <${args.componentName} /> parameter shape is not supported for static prop binding.`,
      });
    }
    return {
      scope: { values },
      diagnostics,
    };
  }

  if (binding.kind === "props-object") {
    for (const [propName, value] of usageValues) {
      values.set(propName, value);
    }
    return {
      scope: {
        values,
        propsObjectName: binding.objectName,
      },
      diagnostics,
    };
  }

  // destructured
  for (const b of binding.bindings) {
    if (usageValues.has(b.propName)) {
      values.set(b.localName, usageValues.get(b.propName)!);
    } else if (b.defaultValue !== undefined) {
      values.set(b.localName, b.defaultValue);
    }
  }

  return { scope: { values }, diagnostics };
}

/**
 * Attach usage-site JSX children onto a prop scope for `{children}` resolution.
 * Text-only children are also stored as a string primitive when safe.
 */
export function attachJsxChildrenToScope(args: {
  scope: PropScope;
  paramBinding: ComponentParamBinding;
  usageChildren: ReadonlyArray<import("@babel/types").Node>;
  resolveOuter?: (node: import("@babel/types").Node) => ReturnType<typeof extractStaticPrimitive>;
}): { childrenBound: boolean } {
  const { scope, paramBinding, usageChildren } = args;
  if (!hasMeaningfulJsxChildren(usageChildren)) {
    return { childrenBound: false };
  }

  let childrenLocalName: string | undefined;
  if (paramBinding.kind === "destructured") {
    const childBinding = paramBinding.bindings.find(
      (b) => b.propName === "children",
    );
    if (!childBinding) {
      return { childrenBound: false };
    }
    childrenLocalName = childBinding.localName;
  } else if (paramBinding.kind === "props-object") {
    childrenLocalName = "children";
  } else {
    return { childrenBound: false };
  }

  const extract = (node: import("@babel/types").Node) =>
    args.resolveOuter
      ? args.resolveOuter(node)
      : extractStaticPrimitive(node);

  const textOnly = extractStaticTextOnlyChildren(usageChildren, extract);
  if (textOnly !== null) {
    scope.values.set(childrenLocalName, textOnly);
  }

  scope.jsxChildren = usageChildren;
  scope.childrenLocalName = childrenLocalName;
  return { childrenBound: true };
}

function hasMeaningfulJsxChildren(
  children: ReadonlyArray<import("@babel/types").Node>,
): boolean {
  for (const child of children) {
    if (child.type === "JSXText") {
      if (child.value.replace(/\s+/g, "").length > 0) return true;
      continue;
    }
    if (child.type === "JSXExpressionContainer") {
      if (child.expression.type !== "JSXEmptyExpression") return true;
      continue;
    }
    if (
      child.type === "JSXElement" ||
      child.type === "JSXFragment" ||
      child.type === "JSXSpreadChild"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Returns collapsed static text when children are text/static-primitives only.
 * Returns null when element children or dynamic expressions are present.
 */
export function extractStaticTextOnlyChildren(
  children: ReadonlyArray<import("@babel/types").Node>,
  extract: (
    node: import("@babel/types").Node,
  ) => ReturnType<typeof extractStaticPrimitive> = extractStaticPrimitive,
): string | null {
  let text = "";
  for (const child of children) {
    if (child.type === "JSXText") {
      text += child.value;
      continue;
    }
    if (child.type === "JSXExpressionContainer") {
      const expr = child.expression;
      if (expr.type === "JSXEmptyExpression") continue;
      const prim = extract(expr);
      if (!prim.ok) {
        return null;
      }
      text += prim.value == null ? "" : String(prim.value);
      continue;
    }
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      return null;
    }
    if (child.type === "JSXSpreadChild") {
      return null;
    }
  }
  return text.replace(/\s+/g, " ").trim();
}

/** Collect JSX attribute names present on a usage site (for tests / diagnostics). */
export function listJsxPropNames(node: JSXElement): string[] {
  const names: string[] = [];
  for (const attr of node.openingElement.attributes) {
    if (attr.type !== "JSXAttribute") continue;
    if (attr.name.type === "JSXIdentifier") {
      names.push(attr.name.name);
    }
  }
  return names;
}
