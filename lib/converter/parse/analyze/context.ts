import type { UnsupportedReasonCode } from "../../types/decisions";
import type {
  IrDiagnostic,
  IrNode,
  IrProvenance,
  IrSourceLocation,
} from "../../ir/schema";

export type AnalyzerContext = {
  source: string;
  sourcePath?: string;
  sourceName?: string;
  componentName?: string;
  localComponents: Map<string, LocalComponentDef>;
  diagnostics: IrDiagnostic[];
  idCounter: { value: number };
  /** Depth guard for recursive local component inlining. */
  inlineDepth: number;
};

export type LocalComponentDef = {
  name: string;
  paramNames: string[];
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
