import { z } from "zod";
import type { IrDocument } from "../ir/schema";

export const ResolveStylesOptionsSchema = z
  .object({
    /**
     * One or more CSS source strings supplied with the component/section.
     * Not a repository scanner — callers pass CSS explicitly.
     */
    css: z.union([z.string(), z.array(z.string())]).default([]),
    /**
     * When true (default), resolve curated Tailwind utilities from classNames.
     */
    resolveTailwind: z.boolean().default(true),
    /**
     * When true (default), parse provenance.inlineStyleRaw into IrStyle.
     */
    resolveInline: z.boolean().default(true),
  })
  .strict();

export type ResolveStylesOptions = z.infer<typeof ResolveStylesOptionsSchema>;

export type ResolveStylesResult = {
  document: IrDocument;
};

/**
 * Merge precedence (later wins for the same property path):
 * 1. Tailwind utilities (lowest)
 * 2. Matched CSS rules (by cascade/specificity order)
 * 3. Inline styles (highest)
 */
export const STYLE_MERGE_PRECEDENCE = [
  "tailwind",
  "css",
  "inline",
] as const;
