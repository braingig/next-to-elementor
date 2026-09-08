import type { UnsupportedReasonCode } from "../types/decisions";

/**
 * Prefer Phase 7 report codes while preserving specificity of known emitters.
 */
export function normalizeReasonCode(
  code: UnsupportedReasonCode | undefined,
  hint?: { message?: string },
): UnsupportedReasonCode {
  if (!code) return "other";

  switch (code) {
    case "unsafe-custom": {
      const msg = hint?.message?.toLowerCase() ?? "";
      if (
        msg.includes("url") ||
        msg.includes("href") ||
        msg.includes("protocol") ||
        msg.includes("javascript")
      ) {
        return "unsafe-url";
      }
      return "unsafe-html";
    }
    case "interaction-unsupported":
      return "unsupported-interaction";
    case "semantic-ambiguous":
    case "layout-unsupported":
      return "native-mapping-unavailable";
    case "unknown-css":
      return "unsupported-css";
    default:
      return code;
  }
}

export function reasonCodeForCustomFailure(
  code: UnsupportedReasonCode | undefined,
  message?: string,
): UnsupportedReasonCode {
  if (!code) return "custom-fallback-unavailable";
  if (code === "unsafe-custom") {
    return normalizeReasonCode(code, { message });
  }
  if (
    code === "pro-only-feature" ||
    code === "validation-error" ||
    code === "unsafe-html" ||
    code === "unsafe-url"
  ) {
    return code;
  }
  // Native-layer codes that survived into custom failure
  if (
    code === "semantic-ambiguous" ||
    code === "layout-unsupported" ||
    code === "svg-complex" ||
    code === "native-mapping-unavailable"
  ) {
    return "custom-fallback-unavailable";
  }
  return normalizeReasonCode(code, { message });
}
