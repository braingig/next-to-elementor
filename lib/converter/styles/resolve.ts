import type { IrDiagnostic, IrDocument, IrNode, IrStyle } from "../ir/schema";
import { normalizeIrDocument } from "../ir/normalize";
import { compareCascade, matchesSelector, type MatchContext } from "./css/match";
import { parseCssSources, resolveCssVars } from "./css/parse";
import { declarationsToIrStyle, mergeIrStyles } from "./declarations";
import { resolveInlineStyleRaw } from "./inline";
import { resolveTailwindClasses } from "./tailwind/map";
import {
  ResolveStylesOptionsSchema,
  type ResolveStylesOptions,
  type ResolveStylesResult,
} from "./types";

function cssList(css: string | string[] | undefined): string[] {
  if (!css) return [];
  return Array.isArray(css) ? css : [css];
}

function resolveDeclValues(
  declarations: Record<string, string>,
  customProperties: Record<string, string>,
): { declarations: Record<string, string>; unresolvedVars: string[] } {
  const out: Record<string, string> = {};
  const unresolvedVars: string[] = [];
  for (const [k, v] of Object.entries(declarations)) {
    if (k.startsWith("--")) continue;
    const resolved = resolveCssVars(v, customProperties);
    out[k] = resolved.value;
    if (resolved.unresolved) unresolvedVars.push(`${k}:${v}`);
  }
  return { declarations: out, unresolvedVars };
}

function applyCssToNode(
  ctx: MatchContext,
  parsed: ReturnType<typeof parseCssSources>,
  diagnostics: IrDiagnostic[],
): IrStyle {
  const matched = parsed.rules
    .filter((rule) => !rule.skippedReason)
    .filter((rule) => matchesSelector(rule.selectors[0]!, ctx))
    .sort(compareCascade);

  let style: IrStyle = {};
  for (const rule of matched) {
    const { declarations, unresolvedVars } = resolveDeclValues(
      rule.declarations,
      parsed.customProperties,
    );
    for (const item of unresolvedVars) {
      diagnostics.push({
        severity: "warning",
        code: "unknown-css",
        message: `Custom property could not be resolved: ${item}`,
        nodeId: ctx.node.id,
      });
    }
    const { style: piece, unresolved } = declarationsToIrStyle(declarations);
    for (const prop of unresolved) {
      diagnostics.push({
        severity: "info",
        code: "unknown-css",
        message: `CSS property not mapped into IrStyle: ${prop}`,
        nodeId: ctx.node.id,
      });
    }
    if (rule.mediaBreakpoint) {
      style = mergeIrStyles(style, {
        responsive: { [rule.mediaBreakpoint]: piece },
      });
    } else {
      style = mergeIrStyles(style, piece);
    }
  }
  return style;
}

function resolveNode(
  node: IrNode,
  ancestors: IrNode[],
  parsed: ReturnType<typeof parseCssSources>,
  options: ResolveStylesOptions,
  diagnostics: IrDiagnostic[],
): IrNode {
  const ctx: MatchContext = { node, ancestors };

  // 1) Tailwind (lowest precedence)
  let twStyle: IrStyle = {};
  if (options.resolveTailwind) {
    const tw = resolveTailwindClasses(node.provenance?.classNames ?? []);
    twStyle = tw.style;
    for (const cls of tw.unknown) {
      diagnostics.push({
        severity: "warning",
        code: "unknown-tailwind-class",
        message: `Tailwind class "${cls}" is not in the curated map; left unresolved.`,
        nodeId: node.id,
      });
    }
  }

  // 2) CSS rules
  const cssStyle = applyCssToNode(ctx, parsed, diagnostics);

  // 3) Inline (highest)
  let inlineStyle: IrStyle = {};
  if (options.resolveInline) {
    const inline = resolveInlineStyleRaw(node.provenance?.inlineStyleRaw);
    inlineStyle = inline.style;
    for (const prop of inline.unresolved) {
      diagnostics.push({
        severity: "info",
        code: "unknown-css",
        message: `Inline CSS property not mapped into IrStyle: ${prop}`,
        nodeId: node.id,
      });
    }
  }

  // Existing node.style (if any) sits below Tailwind — rare for Phase 3 output.
  const merged = mergeIrStyles(node.style, twStyle, cssStyle, inlineStyle);

  const children = node.children.map((child) =>
    resolveNode(child, [...ancestors, node], parsed, options, diagnostics),
  );

  return {
    ...node,
    style: merged,
    children,
  };
}

/**
 * Resolve classNames / CSS / inline styles on an IR document into IrStyle facts.
 * Does not map to Elementor controls. Deterministic. No repository scanning.
 */
export function resolveStyles(
  document: IrDocument,
  options: Partial<ResolveStylesOptions> = {},
): ResolveStylesResult {
  const opts = ResolveStylesOptionsSchema.parse(options);
  const sources = cssList(opts.css);
  const parsed = parseCssSources(sources);

  const diagnostics: IrDiagnostic[] = [
    ...document.diagnostics,
    ...parsed.diagnostics.map((d) => ({
      severity: "warning" as const,
      code: d.code,
      message: d.message,
    })),
  ];

  const root = resolveNode(document.root, [], parsed, opts, diagnostics);

  return {
    document: normalizeIrDocument({
      ...document,
      root,
      diagnostics,
    }),
  };
}
