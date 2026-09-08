import { z } from "zod";
import { IrNodeKindSchema, IrSourceLocationSchema } from "../ir/schema";
import {
  ConversionDecisionSchema,
  ConversionOutcomeSchema,
  DiagnosticSeveritySchema,
  UnsupportedReasonCodeSchema,
} from "../types/decisions";

export const ReportDiagnosticSchema = z
  .object({
    severity: DiagnosticSeveritySchema,
    code: z.string().min(1),
    message: z.string().min(1),
    nodeId: z.string().optional(),
    loc: IrSourceLocationSchema.optional(),
  })
  .strict();
export type ReportDiagnostic = z.infer<typeof ReportDiagnosticSchema>;

export const ReportNodeEntrySchema = z
  .object({
    nodeId: z.string().min(1),
    irKind: IrNodeKindSchema,
    decision: ConversionDecisionSchema,
    widgetType: z.string().optional(),
    reasonCode: UnsupportedReasonCodeSchema.optional(),
    message: z.string().min(1),
    provenance: z
      .object({
        sourcePath: z.string().optional(),
        componentName: z.string().optional(),
        htmlTag: z.string().optional(),
        loc: IrSourceLocationSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.decision === "unsupported" && entry.reasonCode === undefined) {
      ctx.addIssue({
        code: "custom",
        message: "reasonCode is required when decision is unsupported",
        path: ["reasonCode"],
      });
    }
  });
export type ReportNodeEntry = z.infer<typeof ReportNodeEntrySchema>;

export const ReportSummarySchema = z
  .object({
    totalNodes: z.number().int().nonnegative(),
    nativeCount: z.number().int().nonnegative(),
    customCount: z.number().int().nonnegative(),
    unsupportedCount: z.number().int().nonnegative(),
    warningCount: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    message: z.string().min(1),
  })
  .strict();
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

export const FreeComplianceViolationSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["widget", "control", "feature"]),
    message: z.string().min(1),
  })
  .strict();
export type FreeComplianceViolation = z.infer<
  typeof FreeComplianceViolationSchema
>;

export const FreeComplianceSchema = z
  .object({
    passed: z.boolean(),
    violations: z.array(FreeComplianceViolationSchema).default([]),
  })
  .strict();
export type FreeCompliance = z.infer<typeof FreeComplianceSchema>;

export const ConversionReportSchema = z
  .object({
    summary: ReportSummarySchema,
    nodes: z.array(ReportNodeEntrySchema).default([]),
    diagnostics: z.array(ReportDiagnosticSchema).default([]),
    freeCompliance: FreeComplianceSchema,
  })
  .strict();
export type ConversionReport = z.infer<typeof ConversionReportSchema>;

/**
 * Top-level pipeline result contract.
 * `elementorJson` remains opaque until Phase 9 defines its schema.
 */
export const ConversionResultSchema = z
  .object({
    outcome: ConversionOutcomeSchema,
    catalogVersion: z.string().min(1),
    elementorTarget: z.string().min(1),
    irVersion: z.string().min(1),
    elementorJson: z.unknown().nullable(),
    report: ConversionReportSchema,
  })
  .strict()
  .superRefine((result, ctx) => {
    if (result.outcome === "failed" && result.elementorJson !== null) {
      ctx.addIssue({
        code: "custom",
        message: "elementorJson must be null when outcome is failed",
        path: ["elementorJson"],
      });
    }
    if (result.outcome !== "failed" && result.elementorJson === null) {
      ctx.addIssue({
        code: "custom",
        message: "elementorJson is required when outcome is complete or partial",
        path: ["elementorJson"],
      });
    }
    if (
      !result.report.freeCompliance.passed &&
      result.outcome !== "failed"
    ) {
      ctx.addIssue({
        code: "custom",
        message: "outcome must be failed when freeCompliance.passed is false",
        path: ["outcome"],
      });
    }
    if (
      result.outcome === "complete" &&
      result.report.summary.unsupportedCount > 0
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "outcome cannot be complete when summary.unsupportedCount is greater than 0",
        path: ["outcome"],
      });
    }
  });
export type ConversionResult = z.infer<typeof ConversionResultSchema>;
