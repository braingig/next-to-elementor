import { parse as babelParse } from "@babel/parser";
import type { File } from "@babel/types";
import {
  ParseReactSourceOptionsSchema,
  ReactParseError,
  type ParseReactSourceOptions,
  type ParsedReactSource,
} from "./types";

function detectLanguage(
  source: string,
  options: ParseReactSourceOptions,
): "tsx" | "jsx" {
  if (options.language === "tsx" || options.language === "jsx") {
    return options.language;
  }
  const path = options.sourcePath ?? "";
  if (path.endsWith(".tsx") || path.endsWith(".ts")) {
    return "tsx";
  }
  if (path.endsWith(".jsx") || path.endsWith(".js")) {
    return "jsx";
  }
  // Type annotations / interfaces → treat as TSX.
  if (
    /:\s*[A-Za-z_][\w.<>,\s|[\]&]*(?==|,|\)|\{)/.test(source) ||
    /\binterface\b|\btype\s+[A-Z]/.test(source) ||
    /\bas\s+const\b/.test(source)
  ) {
    return "tsx";
  }
  return "jsx";
}

/**
 * Parse a single React/JSX/TSX source string into a Babel AST.
 * Never executes the source. Throws {@link ReactParseError} on syntax errors.
 */
export function parseReactSource(
  source: string,
  options: Partial<ParseReactSourceOptions> = {},
): ParsedReactSource {
  const opts = ParseReactSourceOptionsSchema.parse(options);
  const language = detectLanguage(source, opts);

  try {
    const ast: File = babelParse(source, {
      sourceType: "module",
      errorRecovery: false,
      allowReturnOutsideFunction: false,
      plugins: [
        "jsx",
        ...(language === "tsx"
          ? (["typescript"] as const)
          : ([] as const)),
      ],
      sourceFilename: opts.sourcePath,
      tokens: false,
      ranges: false,
    });

    return {
      ast,
      language,
      sourcePath: opts.sourcePath,
      source,
    };
  } catch (error) {
    const err = error as {
      message?: string;
      loc?: { line: number; column: number };
    };
    const message = err.message?.replace(/^.*?:\s*/, "") ?? "Failed to parse source";
    throw new ReactParseError(
      `JSX/TSX parse error: ${message}`,
      err.loc
        ? { line: err.loc.line, column: err.loc.column }
        : undefined,
    );
  }
}
