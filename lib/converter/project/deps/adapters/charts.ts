/**
 * Chart dependency adapter — classification only.
 * Does not invent chart data or execute chart libraries.
 */

import type { DependencyAdapter, AdapterApplyResult } from "./types";

export const chartsAdapter: DependencyAdapter = {
  id: "charts",
  apply(input): AdapterApplyResult {
    return {
      status: "unsupported",
      diagnostics: [
        {
          severity: "warning",
          code: "dependency-unsupported",
          message: `${input.packageName}: chart libraries are not converted in Phase 13e. Chart data is never invented or executed.`,
        },
      ],
    };
  },
};
