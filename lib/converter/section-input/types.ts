/**
 * Section-folder input types (virtual file map → existing convertSource).
 * Never maps to real filesystem paths. Never executes user code.
 */

/** Relative POSIX paths → source text. Paths are section-root relative only. */
export type VirtualFiles = Record<string, string>;

export const SECTION_INPUT_LIMITS = {
  /** Max files in a virtual section map. */
  maxFiles: 50,
  /** Max UTF-8 bytes across all file contents. Aligns with API 512 KiB body cap. */
  maxTotalBytes: 512 * 1024,
  /** Max UTF-8 bytes for a single file. */
  maxFileBytes: 256 * 1024,
  /** Max dependency edge depth from the entry file. */
  maxDependencyDepth: 10,
  /** Max unique module nodes in the dependency graph. */
  maxDependencyNodes: 40,
} as const;

export type SectionInputLimits = typeof SECTION_INPUT_LIMITS;

export type SectionDiagnosticSeverity = "error" | "warning" | "info";

export type SectionDiagnostic = {
  severity: SectionDiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
  candidates?: string[];
};

export type DependencyEdge = {
  from: string;
  to: string;
  /** Local binding names introduced by this import (JSX tag names). */
  localNames: string[];
  specifier: string;
};

export type DependencyGraph = {
  nodes: string[];
  edges: DependencyEdge[];
};

export type ResolvedSection = {
  entryPath: string;
  entrySource: string;
  entryComponentName?: string;
  /**
   * Import local-binding name → component source string.
   * Fed to convertSource.knownComponentSources (static inlining only).
   * Props are NOT substituted in this phase.
   */
  knownComponentSources: Record<string, string>;
  /** Path → content for every module visited in the graph (incl. entry). */
  moduleSources: Record<string, string>;
  /**
   * Binding name → resolved module path. Used to detect collisions when the
   * same JSX tag name would map to two different files.
   */
  bindingPaths: Record<string, string>;
  graph: DependencyGraph;
  diagnostics: SectionDiagnostic[];
};

export type ResolveSectionInputOptions = {
  files: VirtualFiles;
  /** Explicit entry file path (section-root relative). */
  entryPath?: string;
  /**
   * Section / folder name hint for `HeroSection/HeroSection.tsx` or
   * root `HeroSection.tsx` matching.
   */
  sectionName?: string;
  /** Prefer this component inside the entry file when multiple exist. */
  componentName?: string;
  limits?: Partial<SectionInputLimits>;
};

export class SectionInputError extends Error {
  readonly code: string;
  readonly diagnostics: SectionDiagnostic[];
  readonly candidates?: string[];

  constructor(
    message: string,
    args: {
      code: string;
      diagnostics?: SectionDiagnostic[];
      candidates?: string[];
    },
  ) {
    super(message);
    this.name = "SectionInputError";
    this.code = args.code;
    this.diagnostics = args.diagnostics ?? [
      {
        severity: "error",
        code: args.code,
        message,
        ...(args.candidates ? { candidates: args.candidates } : {}),
      },
    ];
    this.candidates = args.candidates;
  }
}
