import type { IrNode, IrStyle } from "../ir/schema";
import type { ReportDiagnostic } from "./schema";
import { irBreakpointToSuffix } from "../rules/native/styles/map-style";
import { toBoxShadow, toGridColumns } from "../rules/native/styles/values";
import type { ElementorFreeCatalog } from "../catalog/schema";
import { canUseControl } from "../catalog/compliance";

/**
 * Warn when a native/custom node still carries style facts that were not
 * represented accurately (no silent style loss).
 */
export function collectStyleAccuracyDiagnostics(
  node: IrNode,
  strategy: "native" | "custom",
  catalog: ElementorFreeCatalog,
  widgetType?: string,
): ReportDiagnostic[] {
  const out: ReportDiagnostic[] = [];
  const style = node.style;
  if (!style) return out;

  // Custom Free HTML fallback emits scoped CSS from IrStyle — no native style-loss.
  if (strategy === "custom") return out;

  pushNativeStyleLoss(node.id, style, out, catalog, widgetType);
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
      pushNativeStyleLoss(
        node.id,
        style.responsive[bp],
        out,
        catalog,
        widgetType,
        bp,
      );
    }
  }

  return out;
}

function widgetHasBoxShadowControl(
  catalog: ElementorFreeCatalog,
  widgetType?: string,
): boolean {
  if (!widgetType) return false;
  const ids = [
    "box_shadow_box_shadow",
    "button_box_shadow_box_shadow",
    "image_box_shadow_box_shadow",
    "_box_shadow_box_shadow",
  ];
  return ids.some((id) => canUseControl(catalog, widgetType, id));
}

function pushNativeStyleLoss(
  nodeId: string,
  style: IrStyle | undefined,
  out: ReportDiagnostic[],
  catalog: ElementorFreeCatalog,
  widgetType?: string,
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
    const parsed = toBoxShadow(style.effects.boxShadow);
    const canMap =
      parsed != null && widgetHasBoxShadowControl(catalog, widgetType);
    if (!canMap) {
      out.push({
        severity: "warning",
        code: "unsupported-css",
        message: `box-shadow was not mapped to a Free native control${suffix}.`,
        nodeId,
      });
    }
  }
  if (style.background?.image) {
    const canMap =
      Boolean(widgetType) &&
      (canUseControl(catalog, widgetType!, "background_image") ||
        canUseControl(catalog, widgetType!, "_background_image") ||
        canUseControl(catalog, widgetType!, "background_background"));
    if (!canMap) {
      out.push({
        severity: "warning",
        code: "unsupported-css",
        message: `background-image was not mapped to a Free native control${suffix}.`,
        nodeId,
      });
    }
  }
  if (style.background?.color && /gradient\(/i.test(style.background.color)) {
    out.push({
      severity: "warning",
      code: "unsupported-css",
      message: `Gradient background-color was not mapped to a Free native color control${suffix}.`,
      nodeId,
    });
  }
  if (style.layout?.gridTemplateColumns) {
    if (toGridColumns(style.layout.gridTemplateColumns) == null) {
      out.push({
        severity: "warning",
        code: "layout-unsupported",
        message: `grid-template-columns "${style.layout.gridTemplateColumns}" is not representable as Free equal-fr tracks${suffix}.`,
        nodeId,
      });
    }
  }
  if (style.typography?.letterSpacing) {
    const canMap =
      Boolean(widgetType) &&
      canUseControl(catalog, widgetType!, "typography_letter_spacing");
    if (!canMap) {
      out.push({
        severity: "warning",
        code: "unsupported-css",
        message: `letter-spacing was not mapped to a Free native control${suffix}.`,
        nodeId,
      });
    }
  }
  if (style.typography?.lineHeight) {
    const canMap =
      Boolean(widgetType) &&
      canUseControl(catalog, widgetType!, "typography_line_height");
    if (!canMap) {
      out.push({
        severity: "warning",
        code: "unsupported-css",
        message: `line-height was not mapped to a Free native control${suffix}.`,
        nodeId,
      });
    }
  }
  if (style.typography?.textDecoration) {
    out.push({
      severity: "warning",
      code: "unsupported-css",
      message: `text-decoration was not mapped to a Free native control${suffix}.`,
      nodeId,
    });
  }
}
