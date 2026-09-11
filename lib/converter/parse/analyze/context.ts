import type { UnsupportedReasonCode } from "../../types/decisions";
import type {
  IrDiagnostic,
  IrNode,
  IrProvenance,
  IrSourceLocation,
} from "../../ir/schema";
import type { ComponentParamBinding } from "./bind-props";
import type { StaticPrimitive } from "./static-value";
import {
  lookupImportedStaticArray,
  lookupImportedStaticObject,
} from "./static-module-exports";

export type PropScope = {
  /** Local binding name → static value */
  values: Map<string, StaticPrimitive>;
  /** When the component uses `(props) => …`, member access `props.x` resolves here. */
  propsObjectName?: string;
  /**
   * Object-shaped bindings (e.g. Array.map item): `feature.title` resolves via
   * objectBindings.get("feature").get("title") without exposing bare `title`.
   */
  objectBindings?: Map<string, Map<string, StaticPrimitive>>;
  /**
   * Usage-site JSX children for `{children}` / `props.children` during inlining.
   * Converted on demand — never executed.
   */
  jsxChildren?: ReadonlyArray<import("@babel/types").Node>;
  /** Local identifier that refers to JSX children (usually `"children"`). */
  childrenLocalName?: string;
};

export type AnalyzerContext = {
  source: string;
  sourcePath?: string;
  sourceName?: string;
  componentName?: string;
  localComponents: Map<string, LocalComponentDef>;
  /**
   * Fully-static `const name = [ ... ]` bindings from the *entry* source only.
   * Known-component arrays live in `componentStaticArrays` to avoid name collisions.
   */
  staticArrays: Map<
    string,
    import("./static-array-map").StaticArrayElement[]
  >;
  /** Entry-source static object literals. */
  staticObjects: Map<string, Map<string, StaticPrimitive>>;
  /**
   * Per known-component static arrays (keyed by component name, then array binding).
   * QuoteForm.SERVICES must not be visible while inlining Services.
   */
  componentStaticArrays: Map<
    string,
    Map<string, import("./static-array-map").StaticArrayElement[]>
  >;
  /** Per known-component static object literals. */
  componentStaticObjects: Map<string, Map<string, StaticPrimitive>>;
  /**
   * Stack of inlined known-component names (innermost last).
   * Array/object binding lookup prefers the innermost component scope.
   */
  inlineComponentStack: string[];
  /**
   * Optional VFS module path → static arrays/objects/exports (from moduleSources).
   * Used only for import → export resolution; never a flat global name map.
   */
  moduleStaticRegistry: Map<
    string,
    import("./static-module-exports").ModuleStaticBindings
  >;
  /** Entry-file named imports → resolved module export. */
  entryImportBindings: Map<
    string,
    import("./static-module-exports").ResolvedImportBinding
  >;
  /** Per known-component named imports → resolved module export. */
  componentImportBindings: Map<
    string,
    Map<string, import("./static-module-exports").ResolvedImportBinding>
  >;
  diagnostics: IrDiagnostic[];
  idCounter: { value: number };
  /** Depth guard for recursive local component inlining. */
  inlineDepth: number;
  /**
   * Depth guard for unknown-component children passthrough
   * (nested AccordionItem → Trigger → …).
   */
  passthroughDepth: number;
  /** Stack of static prop scopes for nested local inlining (innermost last). */
  propScopes: PropScope[];
};

export type LocalComponentDef = {
  name: string;
  /** Back-compat list of local param / binding names. */
  paramNames: string[];
  /** How JSX props map onto the component parameter. */
  paramBinding: ComponentParamBinding;
  /** Babel JSX root returned by the component (expression node). */
  jsxRoot: import("@babel/types").Expression | import("@babel/types").JSXElement | import("@babel/types").JSXFragment;
};

export function nextId(ctx: AnalyzerContext, prefix = "n"): string {
  const id = `${prefix}${ctx.idCounter.value}`;
  ctx.idCounter.value += 1;
  return id;
}

export function locFromBabel(node: {
  loc?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  } | null;
}): IrSourceLocation | undefined {
  if (!node.loc) {
    return undefined;
  }
  return {
    line: node.loc.start.line,
    column: node.loc.start.column,
    endLine: node.loc.end.line,
    endColumn: node.loc.end.column,
  };
}

export function addDiagnostic(
  ctx: AnalyzerContext,
  diagnostic: IrDiagnostic,
): void {
  ctx.diagnostics.push(diagnostic);
}

export function emptyProvenance(
  partial: Partial<IrProvenance> = {},
): IrProvenance {
  return {
    classNames: [],
    attributes: {},
    ...partial,
  };
}

export function unsupportedNode(
  ctx: AnalyzerContext,
  args: {
    reasonCode: UnsupportedReasonCode;
    message: string;
    originalSummary?: string;
    provenance?: Partial<IrProvenance>;
    loc?: IrSourceLocation;
  },
): IrNode {
  const id = nextId(ctx);
  addDiagnostic(ctx, {
    severity: "error",
    code: args.reasonCode,
    message: args.message,
    nodeId: id,
    loc: args.loc,
  });
  return {
    id,
    kind: "unsupported",
    status: "ok",
    props: {
      reasonCode: args.reasonCode,
      message: args.message,
      ...(args.originalSummary
        ? { originalSummary: args.originalSummary }
        : {}),
    },
    style: {},
    provenance: emptyProvenance({
      sourcePath: ctx.sourcePath,
      ...args.provenance,
      loc: args.loc ?? args.provenance?.loc,
    }),
    notes: [],
    children: [],
  };
}

export function uncertainNode(
  ctx: AnalyzerContext,
  base: IrNode,
  message: string,
  reasonCode?: UnsupportedReasonCode,
): IrNode {
  addDiagnostic(ctx, {
    severity: "warning",
    code: reasonCode ?? "semantic-ambiguous",
    message,
    nodeId: base.id,
    loc: base.provenance?.loc,
  });
  return {
    ...base,
    status: "uncertain",
    uncertainty: {
      ...(reasonCode ? { reasonCode } : {}),
      message,
    },
  };
}

/** Look up a destructured / bare prop binding from the innermost scope outward. */
export function lookupPropBinding(
  ctx: AnalyzerContext,
  localName: string,
): { found: true; value: StaticPrimitive } | { found: false } {
  for (let i = ctx.propScopes.length - 1; i >= 0; i -= 1) {
    const scope = ctx.propScopes[i]!;
    if (scope.values.has(localName)) {
      return { found: true, value: scope.values.get(localName)! };
    }
  }
  return { found: false };
}

/** Look up a static array binding scoped to the current inlined component / entry. */
export function lookupStaticArrayBinding(
  ctx: AnalyzerContext,
  name: string,
): import("./static-array-map").StaticArrayElement[] | undefined {
  for (let i = ctx.inlineComponentStack.length - 1; i >= 0; i -= 1) {
    const comp = ctx.inlineComponentStack[i]!;
    const scoped = ctx.componentStaticArrays.get(comp)?.get(name);
    if (scoped) return scoped;

    // Cross-file: only via this component's actual import binding.
    const imported = lookupImportedStaticArray({
      localName: name,
      importBindings: ctx.componentImportBindings.get(comp),
      moduleRegistry: ctx.moduleStaticRegistry,
    });
    if (imported) return imported;
  }

  const entryLocal = ctx.staticArrays.get(name);
  if (entryLocal) return entryLocal;

  return lookupImportedStaticArray({
    localName: name,
    importBindings: ctx.entryImportBindings,
    moduleRegistry: ctx.moduleStaticRegistry,
  });
}

/** Look up `props.title` / `feature.title` style member access. */
export function lookupPropsMember(
  ctx: AnalyzerContext,
  objectName: string,
  propName: string,
): { found: true; value: StaticPrimitive } | { found: false } {
  for (let i = ctx.propScopes.length - 1; i >= 0; i -= 1) {
    const scope = ctx.propScopes[i]!;
    if (scope.propsObjectName === objectName && scope.values.has(propName)) {
      return { found: true, value: scope.values.get(propName)! };
    }
    const objectFields = scope.objectBindings?.get(objectName);
    if (objectFields?.has(propName)) {
      return { found: true, value: objectFields.get(propName)! };
    }
  }
  return { found: false };
}

/**
 * Look up usage-site JSX children bound for `{children}` / `props.children`.
 */
export function lookupJsxChildren(
  ctx: AnalyzerContext,
  localName: string,
): ReadonlyArray<import("@babel/types").Node> | null {
  for (let i = ctx.propScopes.length - 1; i >= 0; i -= 1) {
    const scope = ctx.propScopes[i]!;
    if (scope.childrenLocalName === localName && scope.jsxChildren) {
      return scope.jsxChildren;
    }
  }
  return null;
}

/**
 * Look up `props.children` when children were bound onto a props-object scope.
 */
export function lookupJsxChildrenMember(
  ctx: AnalyzerContext,
  objectName: string,
  propName: string,
): ReadonlyArray<import("@babel/types").Node> | null {
  if (propName !== "children") {
    return null;
  }
  for (let i = ctx.propScopes.length - 1; i >= 0; i -= 1) {
    const scope = ctx.propScopes[i]!;
    if (
      scope.propsObjectName === objectName &&
      scope.childrenLocalName === "children" &&
      scope.jsxChildren
    ) {
      return scope.jsxChildren;
    }
  }
  return null;
}

/** Static object-literal field lookup (`icons["bolt"]`), component-scoped. */
export function lookupStaticObjectField(
  ctx: AnalyzerContext,
  objectName: string,
  key: string,
):
  | { kind: "value"; value: StaticPrimitive }
  | { kind: "missing" }
  | { kind: "unknown-object" } {
  for (let i = ctx.inlineComponentStack.length - 1; i >= 0; i -= 1) {
    const comp = ctx.inlineComponentStack[i]!;
    const scoped = ctx.componentStaticObjects.get(comp)?.get(objectName);
    if (scoped) {
      if (!scoped.has(key)) return { kind: "missing" };
      return { kind: "value", value: scoped.get(key)! };
    }

    const imported = lookupImportedStaticObject({
      localName: objectName,
      importBindings: ctx.componentImportBindings.get(comp),
      moduleRegistry: ctx.moduleStaticRegistry,
    });
    if (imported) {
      if (!imported.has(key)) return { kind: "missing" };
      return { kind: "value", value: imported.get(key)! };
    }
  }
  const fields = ctx.staticObjects.get(objectName);
  if (fields) {
    if (!fields.has(key)) {
      return { kind: "missing" };
    }
    return { kind: "value", value: fields.get(key)! };
  }

  const importedEntry = lookupImportedStaticObject({
    localName: objectName,
    importBindings: ctx.entryImportBindings,
    moduleRegistry: ctx.moduleStaticRegistry,
  });
  if (importedEntry) {
    if (!importedEntry.has(key)) return { kind: "missing" };
    return { kind: "value", value: importedEntry.get(key)! };
  }

  return { kind: "unknown-object" };
}
