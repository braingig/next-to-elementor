/**
 * Semantic HTML/JSX tag → IR kind mapping helpers.
 * Intentionally conservative — no Elementor widget assumptions.
 */

export type MappedKind =
  | "container"
  | "group"
  | "heading"
  | "text"
  | "image"
  | "button"
  | "link"
  | "divider"
  | "spacer"
  | "icon"
  | "list"
  | "list-item"
  | "html-embed"
  | "unsupported";

const CONTAINER_TAGS = new Set([
  "div",
  "section",
  "main",
  "header",
  "footer",
  "article",
  "aside",
  "nav",
  "form",
  "fieldset",
  "figure",
  "figcaption",
  "blockquote",
  "address",
  "dialog",
]);

const GROUP_TAGS = new Set(["span", "label", "output", "time", "mark", "small", "strong", "em", "b", "i", "u"]);

export function mapHtmlTagToKind(
  tag: string,
  opts: {
    hasBlockChildren: boolean;
    isEmpty: boolean;
    attributes: Record<string, string>;
  },
): { kind: MappedKind; headingLevel?: number; notes?: string } {
  const t = tag.toLowerCase();

  if (/^h[1-6]$/.test(t)) {
    return { kind: "heading", headingLevel: Number(t[1]) };
  }

  if (t === "p") {
    return { kind: "text" };
  }

  if (t === "img") {
    return { kind: "image" };
  }

  if (t === "hr") {
    return { kind: "divider" };
  }

  if (t === "ul" || t === "ol") {
    return { kind: "list" };
  }

  if (t === "li") {
    return { kind: "list-item" };
  }

  if (t === "button") {
    return { kind: "button" };
  }

  if (t === "a") {
    // Anchor with button-like role stays link unless explicitly button-ish.
    if (opts.attributes.role === "button") {
      return { kind: "button" };
    }
    return { kind: "link" };
  }

  if (t === "svg") {
    // Only treat as icon when clearly icon-sized / labeled; otherwise uncertain group handled by caller.
    return { kind: "icon" };
  }

  if (t === "br") {
    return { kind: "text", notes: "br-as-text" };
  }

  // Spacer only when clearly empty presentational box with explicit height/width intent.
  if (
    t === "div" &&
    opts.isEmpty &&
    (opts.attributes["aria-hidden"] === "true" ||
      opts.attributes["data-spacer"] === "true") &&
    (Boolean(opts.attributes.style) || Boolean(opts.attributes.className))
  ) {
    return { kind: "spacer" };
  }

  if (CONTAINER_TAGS.has(t)) {
    return { kind: "container" };
  }

  if (GROUP_TAGS.has(t)) {
    if (opts.hasBlockChildren) {
      return { kind: "group" };
    }
    return { kind: "group" };
  }

  // Unknown HTML tags — do not invent Elementor widgets.
  return { kind: "html-embed", notes: `unmapped-html-tag:${t}` };
}

export function isIntrinsicHtmlTag(name: string): boolean {
  return /^[a-z]/.test(name);
}

export function isFragmentName(name: string): boolean {
  return name === "Fragment" || name === "React.Fragment";
}
