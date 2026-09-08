import type { IrDocument, IrNode } from "../ir/schema";
import type { ElementorFreeCatalog } from "../catalog/schema";
import type { ConversionOutcome } from "../types/decisions";
import type {
  NativeConversionResult,
  NativeNodeDecision,
} from "../rules/native/types";
import {
  ConversionReportSchema,
  ConversionResultSchema,
  type ConversionReport,
  type ConversionResult,
  type ReportDiagnostic,
  type ReportNodeEntry,
} from "./schema";
import {
  normalizeReasonCode,
  reasonCodeForCustomFailure,
} from "./reasons";
import { collectStyleAccuracyDiagnostics } from "./style-loss";

function walkIrNodes(node: IrNode, visit: (n: IrNode) => void): void {
  visit(node);
  for (const child of node.children) walkIrNodes(child, visit);
}

function flattenDecisions(decision: NativeNodeDecision): NativeNodeDecision[] {
  const out = [decision];
  for (const child of decision.children ?? []) {
    out.push(...flattenDecisions(child));
  }
  return out;
}

function provenanceOf(node: IrNode): ReportNodeEntry["provenance"] {
  const p = node.provenance;
  if (!p) return undefined;
  const out: NonNullable<ReportNodeEntry["provenance"]> = {};
  if (p.sourcePath) out.sourcePath = p.sourcePath;
  if (p.componentName) out.componentName = p.componentName;
  if (p.htmlTag) out.htmlTag = p.htmlTag;
  if (p.loc) out.loc = p.loc;
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Resolve a final decision for every IR node (no silent omissions).
 * Descendants absorbed into a parent custom HTML widget are marked `custom`.
 */
export function decisionsCoveringIrTree(
  root: IrNode,
  conversionDecisions: NativeNodeDecision[],
): NativeNodeDecision[] {
  const byId = new Map<string, NativeNodeDecision>();
  for (const d of conversionDecisions) {
    for (const flat of flattenDecisions(d)) {
      byId.set(flat.nodeId, flat);
    }
  }

  const absorbedByParent = new Map<string, string>();

  walkIrNodes(root, (node) => {
    const d = byId.get(node.id);
    if (!d || d.strategy !== "custom") return;
    const coveredChildren = new Set(
      (d.children ?? []).map((c) => c.nodeId),
    );
    // If custom emit did not list children, IR children were serialized into the HTML widget.
    if (node.children.length > 0 && coveredChildren.size === 0) {
      const mark = (n: IrNode) => {
        for (const child of n.children) {
          if (!byId.has(child.id)) {
            absorbedByParent.set(child.id, node.id);
          }
          mark(child);
        }
      };
      mark(node);
    }
  });

  const ordered: NativeNodeDecision[] = [];
  walkIrNodes(root, (node) => {
    const existing = byId.get(node.id);
    if (existing) {
      ordered.push({
        ...existing,
        strategy:
          existing.strategy === "needs-fallback"
            ? "unsupported"
            : existing.strategy,
        ...(existing.strategy === "needs-fallback"
          ? {
              reasonCode: "custom-fallback-unavailable" as const,
            }
          : {}),
        children: undefined,
      });
      return;
    }

    const parentId = absorbedByParent.get(node.id);
    if (parentId) {
      ordered.push({
        nodeId: node.id,
        irKind: node.kind,
        strategy: "custom",
        elementorType: "html",
        message: `Included in parent custom HTML fallback (${parentId}).`,
      });
      return;
    }

    ordered.push({
      nodeId: node.id,
      irKind: node.kind,
      strategy: "unsupported",
      reasonCode: "insufficient-source-information",
      message:
        "IR node was not covered by conversion decisions; recorded as unsupported.",
    });
  });

  return ordered;
}

function toReportNodeEntry(
  decision: NativeNodeDecision,
  irById: Map<string, IrNode>,
): ReportNodeEntry {
  const node = irById.get(decision.nodeId);
  const strategy =
    decision.strategy === "needs-fallback" ? "unsupported" : decision.strategy;

  let reasonCode = decision.reasonCode;
  let message = decision.message;

  if (strategy === "unsupported") {
    if (node?.kind === "unsupported") {
      reasonCode = normalizeReasonCode(node.props.reasonCode, {
        message: node.props.message,
      });
      message = decision.message || node.props.message;
    } else if (decision.strategy === "needs-fallback") {
      reasonCode = "custom-fallback-unavailable";
    } else {
      reasonCode = reasonCodeForCustomFailure(reasonCode, message);
    }
  } else if (strategy === "custom" && reasonCode) {
    reasonCode = normalizeReasonCode(reasonCode, { message });
  }

  const entry: ReportNodeEntry = {
    nodeId: decision.nodeId,
    irKind: (node?.kind ?? decision.irKind) as ReportNodeEntry["irKind"],
    decision: strategy,
    message,
    ...(decision.elementorType
      ? {
          widgetType:
            decision.elementorType === "container"
              ? "container"
              : decision.elementorType,
        }
      : {}),
    ...(strategy === "unsupported"
      ? { reasonCode: reasonCode ?? "other" }
      : reasonCode
        ? { reasonCode }
        : {}),
    ...(node ? { provenance: provenanceOf(node) } : {}),
  };

  return entry;
}

function compareDiagnostics(a: ReportDiagnostic, b: ReportDiagnostic): number {
  return (
    a.severity.localeCompare(b.severity) ||
    a.code.localeCompare(b.code) ||
    (a.nodeId ?? "").localeCompare(b.nodeId ?? "") ||
    a.message.localeCompare(b.message)
  );
}

function compareNodes(a: ReportNodeEntry, b: ReportNodeEntry): number {
  return a.nodeId.localeCompare(b.nodeId);
}

export type BuildConversionReportInput = {
  ir: IrDocument;
  conversion: NativeConversionResult;
  catalog: ElementorFreeCatalog;
  conversionDiagnostics?: ReportDiagnostic[];
};

/**
 * Build a deterministic ConversionReport covering every IR node.
 */
export function buildConversionReport(
  input: BuildConversionReportInput,
): ConversionReport {
  const { ir, conversion, catalog } = input;
  const irById = new Map<string, IrNode>();
  walkIrNodes(ir.root, (n) => irById.set(n.id, n));

  const covered = decisionsCoveringIrTree(ir.root, conversion.decisions);
  const nodes = covered.map((d) => toReportNodeEntry(d, irById)).sort(compareNodes);

  const diagnostics: ReportDiagnostic[] = [
    ...ir.diagnostics.map((d) => ({
      severity: d.severity,
      code: d.code,
      message: d.message,
      ...(d.nodeId ? { nodeId: d.nodeId } : {}),
      ...(d.loc ? { loc: d.loc } : {}),
    })),
    ...(input.conversionDiagnostics ?? []),
  ];

  for (const entry of nodes) {
    const node = irById.get(entry.nodeId);
    if (!node) continue;
    if (entry.decision === "native" || entry.decision === "custom") {
      // Style loss warnings only for the emitted custom root / native nodes,
      // not for children merely included inside parent custom HTML.
      const isIncluded =
        entry.decision === "custom" &&
        entry.message.startsWith("Included in parent custom HTML fallback");
      if (!isIncluded) {
        diagnostics.push(
          ...collectStyleAccuracyDiagnostics(node, entry.decision, catalog),
        );
      }
    }
    if (entry.decision === "unsupported") {
      diagnostics.push({
        severity: "error",
        code: entry.reasonCode ?? "other",
        message: entry.message,
        nodeId: entry.nodeId,
        ...(entry.provenance?.loc ? { loc: entry.provenance.loc } : {}),
      });
    }
  }

  for (const v of conversion.complianceViolations) {
    diagnostics.push({
      severity: "error",
      code: "pro-only-feature",
      message: v.message,
    });
  }

  diagnostics.sort(compareDiagnostics);

  const seen = new Set<string>();
  const deduped: ReportDiagnostic[] = [];
  for (const d of diagnostics) {
    const key = `${d.severity}|${d.code}|${d.nodeId ?? ""}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(d);
  }

  const nativeCount = nodes.filter((n) => n.decision === "native").length;
  const customCount = nodes.filter((n) => n.decision === "custom").length;
  const unsupportedCount = nodes.filter(
    (n) => n.decision === "unsupported",
  ).length;
  const warningCount = deduped.filter((d) => d.severity === "warning").length;
  const errorCount = deduped.filter((d) => d.severity === "error").length;

  const message = [
    `${nodes.length} nodes`,
    `${nativeCount} native`,
    `${customCount} custom`,
    `${unsupportedCount} unsupported`,
  ].join(", ");

  return ConversionReportSchema.parse({
    summary: {
      totalNodes: nodes.length,
      nativeCount,
      customCount,
      unsupportedCount,
      warningCount,
      errorCount,
      message,
    },
    nodes,
    diagnostics: deduped,
    freeCompliance: {
      passed: conversion.compliancePassed,
      violations: conversion.complianceViolations,
    },
  });
}

export function deriveOutcome(
  conversion: NativeConversionResult,
  report: ConversionReport,
): ConversionOutcome {
  if (
    !conversion.compliancePassed ||
    conversion.outcome === "failed" ||
    !conversion.document
  ) {
    return "failed";
  }
  if (
    report.summary.unsupportedCount > 0 ||
    report.summary.warningCount > 0 ||
    report.summary.errorCount > 0
  ) {
    return "partial";
  }
  return "complete";
}

export type BuildConversionResultInput = BuildConversionReportInput & {
  catalogVersion?: string;
  elementorTarget?: string;
};

/**
 * Assemble the Phase 7 top-level ConversionResult.
 */
export function buildConversionResult(
  input: BuildConversionResultInput,
): ConversionResult {
  const report = buildConversionReport(input);
  const outcome = deriveOutcome(input.conversion, report);
  const catalog = input.catalog;

  return ConversionResultSchema.parse({
    outcome,
    catalogVersion: input.catalogVersion ?? catalog.version,
    elementorTarget: input.elementorTarget ?? catalog.elementorTarget,
    irVersion: input.ir.version,
    elementorJson:
      outcome === "failed" ? null : (input.conversion.document ?? null),
    report,
  });
}

/**
 * Deterministic JSON stringify for report snapshots.
 */
export function canonicalizeConversionReport(report: ConversionReport): string {
  return `${JSON.stringify(ConversionReportSchema.parse(report))}\n`;
}
