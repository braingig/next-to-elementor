import type { IrNode } from "../../ir/schema";
import { escapeHtmlAttr, escapeHtmlText } from "./safety";

function tagForNode(node: IrNode): string {
  if (node.provenance?.htmlTag) {
    return node.provenance.htmlTag.toLowerCase();
  }
  switch (node.kind) {
    case "heading":
      return `h${node.props.level}`;
    case "text":
      return "p";
    case "image":
      return "img";
    case "button":
      return node.props.href ? "a" : "button";
    case "link":
      return "a";
    case "list":
      return node.props.listType === "ol" ? "ol" : "ul";
    case "list-item":
      return "li";
    case "divider":
      return "hr";
    case "spacer":
    case "icon":
    case "html-embed":
    case "container":
    case "group":
      return (
        ("as" in node.props && node.props.as?.toLowerCase()) ||
        (node.kind === "icon" ? "span" : "div")
      );
    default:
      return "div";
  }
}

function voidTag(tag: string): boolean {
  return tag === "img" || tag === "hr" || tag === "br" || tag === "input";
}

function buildAttributes(
  node: IrNode,
  extraClass?: string,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.provenance?.attributes ?? {})) {
    if (key === "class" || key === "className") continue;
    attrs[key] = value;
  }

  const classes = new Set<string>();
  if (extraClass) classes.add(extraClass);
  for (const c of node.provenance?.classNames ?? []) {
    if (c) classes.add(c);
  }
  const rawClass = node.provenance?.attributes?.class ?? node.provenance?.attributes?.className;
  if (rawClass) {
    for (const c of rawClass.split(/\s+/)) {
      if (c) classes.add(c);
    }
  }
  if (classes.size > 0) {
    attrs.class = [...classes].sort().join(" ");
  }

  switch (node.kind) {
    case "image":
      attrs.src = node.props.src;
      attrs.alt = node.props.alt ?? "";
      // Prefer resolved IR height/width (e.g. Tailwind h-12) as inline styles so
      // custom-HTML fallbacks don't rely on site-wide Tailwind CSS. Drop
      // intrinsic width/height attrs when a utility height is present — otherwise
      // large asset dimensions (e.g. 750×501 logos) dominate layout.
      {
        const styleParts: string[] = [];
        if (node.style?.box?.height) {
          styleParts.push(`height:${node.style.box.height}`);
          styleParts.push("width:auto");
          delete attrs.width;
          delete attrs.height;
        } else {
          if (node.props.width) attrs.width = String(node.props.width);
          if (node.props.height) attrs.height = String(node.props.height);
          if (node.style?.box?.width) {
            styleParts.push(`width:${node.style.box.width}`);
          }
        }
        if (node.style?.box?.maxWidth) {
          styleParts.push(`max-width:${node.style.box.maxWidth}`);
        }
        if (styleParts.length > 0) {
          const existing = attrs.style ? `${attrs.style};` : "";
          attrs.style = `${existing}${styleParts.join(";")}`;
        }
      }
      break;
    case "link":
      attrs.href = node.props.href;
      if (node.props.target) attrs.target = node.props.target;
      if (node.props.rel) attrs.rel = node.props.rel;
      break;
    case "button":
      if (node.props.href) {
        attrs.href = node.props.href;
        if (node.props.target) attrs.target = node.props.target;
        if (node.props.rel) attrs.rel = node.props.rel;
      } else if (node.props.type && node.props.type !== "link") {
        attrs.type = node.props.type;
      }
      break;
    case "spacer":
      attrs["aria-hidden"] = attrs["aria-hidden"] ?? "true";
      break;
    default:
      break;
  }

  return attrs;
}

function renderOpenTag(tag: string, attrs: Record<string, string>): string {
  const parts = [`<${tag}`];
  for (const key of Object.keys(attrs).sort()) {
    parts.push(` ${key}="${escapeHtmlAttr(attrs[key]!)}"`);
  }
  parts.push(voidTag(tag) ? " />" : ">");
  return parts.join("");
}

function leafText(node: IrNode): string | undefined {
  switch (node.kind) {
    case "heading":
      return node.props.text;
    case "text":
      return node.props.html ? undefined : node.props.text;
    case "button":
    case "link":
      return node.props.text;
    case "list-item":
      return node.props.text;
    default:
      return undefined;
  }
}

function serializeNode(node: IrNode, scopeClass?: string): string {
  if (node.kind === "html-embed") {
    const tag = (node.provenance?.htmlTag ?? "div").toLowerCase();
    const attrs = buildAttributes(node, scopeClass);
    if (node.children.length > 0) {
      const inner = node.children.map((c) => serializeNode(c)).join("");
      if (voidTag(tag)) {
        return renderOpenTag(tag, attrs);
      }
      return `${renderOpenTag(tag, attrs)}${inner}</${tag}>`;
    }
    // Prefer preserved markup when present; avoid wrapping empty stubs twice.
    if (node.props.html && !/^<[a-z][\w-]*><\/[a-z][\w-]*>$/i.test(node.props.html.trim())) {
      return node.props.html;
    }
    if (voidTag(tag)) {
      return renderOpenTag(tag, attrs);
    }
    return `${renderOpenTag(tag, attrs)}${node.props.html ?? ""}</${tag}>`;
  }

  if (node.kind === "icon" && node.props.svg) {
    const attrs = buildAttributes(node, scopeClass);
    // Real SVG markup is already a complete element — don't wrap in a way that nests invalidly.
    const svg = node.props.svg.trim();
    if (svg.startsWith("<svg")) {
      // Merge scope class onto the svg root when possible.
      if (scopeClass && !/\sclass=/.test(svg)) {
        return svg.replace(/^<svg\b/, `<svg class="${escapeHtmlAttr(scopeClass)}"`);
      }
      if (scopeClass) {
        return `${renderOpenTag("span", { class: scopeClass })}${svg}</span>`;
      }
      return svg;
    }
    return `${renderOpenTag("span", attrs)}${svg}</span>`;
  }

  if (node.kind === "icon" && node.props.src) {
    const attrs = buildAttributes(node, scopeClass);
    attrs.src = node.props.src;
    attrs.alt = attrs.alt ?? "";
    return renderOpenTag("img", attrs);
  }

  const tag = tagForNode(node);
  const attrs = buildAttributes(node, scopeClass);

  if (voidTag(tag)) {
    return renderOpenTag(tag, attrs);
  }

  const inner: string[] = [];
  if (node.kind === "text" && node.props.html) {
    inner.push(node.props.html);
  } else if (node.children.length === 0) {
    const text = leafText(node);
    if (text != null) {
      inner.push(escapeHtmlText(text));
    }
  }

  for (const child of node.children) {
    inner.push(serializeNode(child));
  }

  return `${renderOpenTag(tag, attrs)}${inner.join("")}</${tag}>`;
}

/**
 * Deterministic IR → HTML for a fallback root node.
 * Only the root receives `scopeClass` for CSS scoping.
 */
export function serializeIrNodeHtml(node: IrNode, scopeClass: string): string {
  return serializeNode(node, scopeClass);
}
