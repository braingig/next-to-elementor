import { createHash } from "node:crypto";
import { z } from "zod";
import type { UnsupportedReasonCode } from "../../types/decisions";

/** Phase 5 native conversion strategy (fallback deferred to Phase 6). */
export const NativeStrategySchema = z.enum([
  "native",
  "needs-fallback",
  "unsupported",
]);
export type NativeStrategy = z.infer<typeof NativeStrategySchema>;

export const ElementorSettingsSchema = z.record(z.string(), z.unknown());
export type ElementorSettings = z.infer<typeof ElementorSettingsSchema>;

export type ElementorElement = {
  id: string;
  elType: "container" | "widget";
  widgetType?: string;
  isInner?: boolean;
  settings: ElementorSettings;
  elements: ElementorElement[];
};

export type ElementorDocument = {
  version: "0.4";
  title: string;
  type: "page";
  content: ElementorElement[];
};

export type NativeNodeDecision = {
  nodeId: string;
  irKind: string;
  strategy: NativeStrategy;
  elementorType?: string;
  settings?: ElementorSettings;
  reasonCode?: UnsupportedReasonCode;
  message: string;
  children?: NativeNodeDecision[];
};

export type NativeConversionResult = {
  outcome: "success" | "partial" | "failed";
  document?: ElementorDocument;
  decisions: NativeNodeDecision[];
  compliancePassed: boolean;
  complianceViolations: Array<{ id: string; kind: string; message: string }>;
};

/** Deterministic Elementor-style 7-char hex id from IR node id. */
export function elementorIdFromIrId(irId: string): string {
  return createHash("sha1").update(irId).digest("hex").slice(0, 7);
}
