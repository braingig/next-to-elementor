import type { IrNode } from "../../ir/schema";
import { escapeHtmlAttr, escapeHtmlText } from "./safety";
import { scopedClassForNode } from "./css";

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

/**
 * Custom HTML fallback must not leave Tailwind/utility class names whose CSS
 * is absent. Resolved visual styles are emitted via scoped CSS from IrStyle.
 * Keep only the per-node scope class on the element.
 */
function buildAttributes(
  node: IrNode,
  scopeClass: string,
): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(node.provenance?.attributes ?? {})) {
    if (key === "class" || key === "className" || key === "style") continue;
    attrs[key] = value;
  }

  attrs.class = scopeClass;

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
        } else if (
          node.style?.box?.maxHeight &&
          node.style.box.maxHeight !== "none"
        ) {
          styleParts.push(`max-height:${node.style.box.maxHeight}`);
          styleParts.push("width:auto");
          styleParts.push("height:auto");
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
        if (node.style?.box?.objectFit) {
          styleParts.push(`object-fit:${node.style.box.objectFit}`);
        }
        if (node.style?.box?.objectPosition) {
          styleParts.push(`object-position:${node.style.box.objectPosition}`);
        }
        if (styleParts.length > 0) {
          attrs.style = styleParts.join(";");
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

function serializeNode(
  node: IrNode,
  rootScopeClass: string,
  isRoot: boolean,
): string {
  const scopeClass = scopedClassForNode(rootScopeClass, node.id, isRoot);

  if (node.kind === "html-embed") {
    const tag = (node.provenance?.htmlTag ?? "div").toLowerCase();
    const attrs = buildAttributes(node, scopeClass);
    if (node.children.length > 0) {
      const inner = node.children
        .map((c) => serializeNode(c, rootScopeClass, false))
        .join("");
      if (voidTag(tag)) {
        return renderOpenTag(tag, attrs);
      }
      return `${renderOpenTag(tag, attrs)}${inner}</${tag}>`;
    }
    // Prefer preserved markup when present; avoid wrapping empty stubs twice.
    if (
      node.props.html &&
      !/^<[a-z][\w-]*><\/[a-z][\w-]*>$/i.test(node.props.html.trim())
    ) {
      // Wrap preserved markup so the scope class still applies for CSS.
      return `${renderOpenTag("div", { class: scopeClass })}${node.props.html}</div>`;
    }
    if (voidTag(tag)) {
      return renderOpenTag(tag, attrs);
    }
    return `${renderOpenTag(tag, attrs)}${node.props.html ?? ""}</${tag}>`;
  }

  if (node.kind === "icon" && node.props.svg) {
    const attrs = buildAttributes(node, scopeClass);
    const svg = node.props.svg.trim();
    if (svg.startsWith("<svg")) {
      if (!/\sclass=/.test(svg)) {
        return svg.replace(
          /^<svg\b/,
          `<svg class="${escapeHtmlAttr(scopeClass)}"`,
        );
      }
      return `${renderOpenTag("span", { class: scopeClass })}${svg}</span>`;
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
    inner.push(serializeNode(child, rootScopeClass, false));
  }

  return `${renderOpenTag(tag, attrs)}${inner.join("")}</${tag}>`;
}

/**
 * Deterministic IR → HTML for a fallback root node.
 * Every node receives a unique scoped class; original utility classes are omitted
 * so styles come only from {@link serializeSubtreeScopedCss}.
 */
export function serializeIrNodeHtml(node: IrNode, scopeClass: string): string {
  return serializeNode(node, scopeClass, true);
}
