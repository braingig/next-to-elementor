import { z } from "zod";
import type { File } from "@babel/types";
import type { IrDocument } from "../ir/schema";

export const ReactSourceLanguageSchema = z.enum(["tsx", "jsx", "auto"]);
export type ReactSourceLanguage = z.infer<typeof ReactSourceLanguageSchema>;

export const ParseReactSourceOptionsSchema = z
  .object({
    /** Hint for parser plugins; `auto` inspects sourcePath / content. */
    language: ReactSourceLanguageSchema.default("auto"),
    sourcePath: z.string().optional(),
  })
  .strict();
export type ParseReactSourceOptions = z.infer<
  typeof ParseReactSourceOptionsSchema
>;

export const AnalyzeReactOptionsSchema = z
  .object({
    sourcePath: z.string().optional(),
    sourceName: z.string().optional(),
    /** Prefer this exported component name when multiple exist. */
    componentName: z.string().optional(),
    /**
     * Optional map of known local component name → source string defining it.
     * Used only for static structural inlining within the same analysis pass.
     * Never executed.
     */
    knownComponentSources: z.record(z.string(), z.string()).default({}),
    /**
     * Optional VFS module path → source (project/section packaging).
     * Enables cross-file static const array/object export resolution via imports.
     * Never executed; never reads the host filesystem.
     */
    moduleSources: z.record(z.string(), z.string()).default({}),
    /** Optional tsconfig path aliases for resolving non-relative imports. */
    pathAliases: z.record(z.string(), z.array(z.string())).optional(),
  })
  .strict();
export type AnalyzeReactOptions = z.infer<typeof AnalyzeReactOptionsSchema>;

export type ParsedReactSource = {
  ast: File;
  language: "tsx" | "jsx";
  sourcePath?: string;
  source: string;
};

export type AnalyzeReactResult = {
  document: IrDocument;
};

export class ReactParseError extends Error {
  readonly loc?: { line: number; column: number };
  readonly code = "parse-error" as const;

  constructor(message: string, loc?: { line: number; column: number }) {
    super(message);
    this.name = "ReactParseError";
    this.loc = loc;
  }
}
