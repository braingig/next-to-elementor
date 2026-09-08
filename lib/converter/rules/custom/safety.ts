/**
 * Escape helpers for deterministic HTML serialization (no React execution).
 */

export function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const EVENT_ATTR = /^on/i;
const UNSAFE_PROTOCOLS = /^(javascript|vbscript|data\s*:\s*text\/html)/i;

export type UnsafeCustomFinding = {
  code: "unsafe-html" | "unsafe-url";
  message: string;
};

/**
 * Detect unsafe HTML/attr patterns that must not be emitted as custom fallback.
 */
export function findUnsafeCustomPatterns(input: {
  html?: string;
  attributes?: Record<string, string>;
  href?: string;
}): UnsafeCustomFinding | undefined {
  if (input.href && UNSAFE_PROTOCOLS.test(input.href.trim())) {
    return {
      code: "unsafe-url",
      message: `Unsafe URL protocol in href: ${input.href}`,
    };
  }
  for (const [key, value] of Object.entries(input.attributes ?? {})) {
    if (EVENT_ATTR.test(key)) {
      return {
        code: "unsafe-html",
        message: `Event handler attribute rejected: ${key}`,
      };
    }
    if (
      (key === "href" || key === "src" || key === "xlink:href") &&
      UNSAFE_PROTOCOLS.test(value.trim())
    ) {
      return {
        code: "unsafe-url",
        message: `Unsafe URL in attribute ${key}`,
      };
    }
  }
  if (input.html) {
    if (/<script\b/i.test(input.html)) {
      return {
        code: "unsafe-html",
        message: "Inline <script> is not allowed in custom fallback.",
      };
    }
    if (/\son[a-z]+\s*=/i.test(input.html)) {
      return {
        code: "unsafe-html",
        message:
          "Inline event-handler attributes are not allowed in custom fallback.",
      };
    }
    if (/javascript\s*:/i.test(input.html)) {
      return {
        code: "unsafe-url",
        message: "javascript: URLs are not allowed in custom fallback.",
      };
    }
  }
  return undefined;
}
