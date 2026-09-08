/**
 * Phase 3: JSX/TSX parser + React AST → IR analysis.
 * Static analysis only. No Elementor conversion. No user code execution.
 */

export { parseReactSource } from "./parse";
export { analyzeReactAst, analyzeReactSource } from "./analyze";
export {
  ReactParseError,
  ParseReactSourceOptionsSchema,
  AnalyzeReactOptionsSchema,
  type ParseReactSourceOptions,
  type AnalyzeReactOptions,
  type ParsedReactSource,
  type AnalyzeReactResult,
  type ReactSourceLanguage,
} from "./types";
