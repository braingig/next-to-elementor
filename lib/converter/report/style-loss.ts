import type { IrNode, IrStyle } from "../ir/schema";
import type { ReportDiagnostic } from "./schema";
import { irBreakpointToSuffix } from "../rules/native/styles/map-style";
import type { ElementorFreeCatalog } from "../catalog/schema";

/**
 * Warn when a native/custom node still carries style facts that were not
 * represented accurately (no silent style loss).
 */
export function collectStyleAccuracyDiagnostics(
  node: IrNode,
  strategy: "native" | "custom",
  catalog: ElementorFreeCatalog,
): ReportDiagnostic[] {
  const out: ReportDiagnostic[] = [];
  const style = node.style;
  if (!style) return out;

  if (strategy === "native") {
    pushNativeStyleLoss(node.id, style, out);
    if (style.responsive) {
      for (const bp of Object.keys(style.responsive)) {
        if (irBreakpointToSuffix(catalog, bp) === null) {
          out.push({
            severity: "warning",
            code: "responsive-unsupported",
            message: `Responsive breakpoint "${bp}" has no Elementor Free mapping; styles at this breakpoint were not applied.`,
            nodeId: node.id,
            ...(node.provenance?.loc ? { loc: node.provenance.loc } : {}),
          });
        }
        pushNativeStyleLoss(node.id, style.responsive[bp], out, bp);
      }
    }
  }

  return out;
}

function pushNativeStyleLoss(
  nodeId: string,
  style: IrStyle | undefined,
  out: ReportDiagnostic[],
  bp?: string,
): void {
  if (!style) return;
  const suffix = bp ? ` (breakpoint ${bp})` : "";

  if (style.effects?.transform) {
    out.push({
      severity: "warning",
      code: "unsupported-css",
      message: `CSS transform was not mapped to a Free native control${suffix}.`,
      nodeId,
    });
  }
  if (style.effects?.boxShadow) {
    out.push({
      severity: "warning",
      code: "unsupported-css",
      message: `box-shadow was not mapped to a Free native control${suffix}.`,
      nodeId,
    });
  }
  if (style.background?.image) {
    out.push({
      severity: "warning",
      code: "unsupported-css",
      message: `background-image was not mapped to a Free native control${suffix}.`,
      nodeId,
    });
  }
  if (style.typography?.letterSpacing) {
    out.push({
      severity: "warning",
      code: "unsupported-css",
      message: `letter-spacing was not mapped to a Free native control${suffix}.`,
      nodeId,
    });
  }
  if (style.typography?.textDecoration) {
    out.push({
      severity: "warning",
      code: "unsupported-css",
      message: `text-decoration was not mapped to a Free native control${suffix}.`,
      nodeId,
    });
  }
  if (style.layout?.display === "grid") {
    // Grid container_type may exist; still flag exotic grid tracks if present later.
  }
}
