import type {
  ElementorElement,
  NativeNodeDecision,
} from "../rules/native/types";

/** Draft element shape produced by native/custom converters before final emit. */
export type ElementorElementDraft = {
  id: string;
  elType: "container" | "widget";
  widgetType?: string;
  settings: Record<string, unknown>;
  elements: ElementorElementDraft[];
};

/**
 * Flatten a decision tree into a pre-order list (root first, then children).
 */
export function flattenDecisions(
  decision: NativeNodeDecision,
): NativeNodeDecision[] {
  const out = [decision];
  for (const child of decision.children ?? []) {
    out.push(...flattenDecisions(child));
  }
  return out;
}

/**
 * Normalize a converter draft into the classic Elementor element shape.
 * Containers always receive `isInner: false` for MVP page-level emission.
 */
export function toElementorElement(
  emit: ElementorElementDraft,
): ElementorElement {
  return {
    id: emit.id,
    elType: emit.elType,
    ...(emit.widgetType ? { widgetType: emit.widgetType } : {}),
    ...(emit.elType === "container" ? { isInner: false } : {}),
    settings: emit.settings,
    elements: emit.elements.map((child) => toElementorElement(child)),
  };
}
