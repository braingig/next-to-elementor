/**
 * Phase 11 runtime validation report vocabulary.
 * Never convert BLOCKED into PASS.
 */

export type RuntimeStatus = "RUNTIME_PASS" | "RUNTIME_FAIL" | "BLOCKED";

export type VisualStatus =
  | "VISUAL_CLOSE"
  | "VISUAL_MINOR_DIFFERENCE"
  | "VISUAL_SIGNIFICANT_DIFFERENCE"
  | "NOT_COMPARABLE"
  | "BLOCKED";

export type FixtureRuntimeResult = {
  name: string;
  importStatus: RuntimeStatus;
  renderStatus: RuntimeStatus | "SKIPPED";
  visualStatus: VisualStatus;
  issues: string[];
  postId?: number;
  permalink?: string;
  widgetsSeen?: string[];
  responsiveKeysSeen?: string[];
  settingsChecks?: Record<string, boolean>;
};

export type RuntimeValidationReport = {
  environment: {
    wordpress: string | null;
    php: string | null;
    elementor: string | null;
    docker: boolean;
    baseUrl: string | null;
    elementorSourcePath: string | null;
    proActive: boolean | null;
  };
  runtimeStatus: RuntimeStatus;
  staticValidation: "STATIC PASS" | "STATIC FAIL" | "NOT_RUN";
  fixtures: FixtureRuntimeResult[];
  blockedReasons: string[];
  generatedAt: string;
};

export function emptyBlockedReport(reasons: string[]): RuntimeValidationReport {
  return {
    environment: {
      wordpress: null,
      php: null,
      elementor: null,
      docker: false,
      baseUrl: null,
      elementorSourcePath: null,
      proActive: null,
    },
    runtimeStatus: "BLOCKED",
    staticValidation: "NOT_RUN",
    fixtures: [],
    blockedReasons: reasons,
    generatedAt: new Date().toISOString(),
  };
}
