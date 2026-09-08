import type { IrDiagnostic, IrDocument, IrNode, IrStyle } from "./schema";
import { parseIrDocument } from "./schema";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortObjectKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted as T;
}

function pruneEmptyObject<T extends Record<string, unknown>>(
  obj: T,
): T | undefined {
  return Object.keys(obj).length === 0 ? undefined : obj;
}

function normalizeStyle(style: IrStyle | undefined): IrStyle {
  if (!style) {
    return {};
  }

  const next: IrStyle = {};

  for (const key of [
    "box",
    "layout",
    "typography",
    "background",
    "border",
    "position",
    "effects",
  ] as const) {
    const group = style[key];
    if (!group || !isPlainObject(group)) {
      continue;
    }
    const pruned = pruneEmptyObject(sortObjectKeys({ ...group }));
    if (pruned) {
      next[key] = pruned as never;
    }
  }

  if (style.responsive) {
    const responsive: Record<string, IrStyle> = {};
    for (const bp of Object.keys(style.responsive).sort()) {
      const normalized = normalizeStyle(style.responsive[bp]);
      if (Object.keys(normalized).length > 0) {
        responsive[bp] = normalized;
      }
    }
    if (Object.keys(responsive).length > 0) {
      next.responsive = responsive;
    }
  }

  return next;
}

function normalizeProvenance(node: IrNode): IrNode["provenance"] {
  const provenance = node.provenance ?? { classNames: [], attributes: {} };
  const attributes = sortObjectKeys({ ...(provenance.attributes ?? {}) });
  const classNames = [...(provenance.classNames ?? [])].sort((a, b) =>
    a.localeCompare(b),
  );

  return {
    ...provenance,
    classNames,
    attributes,
  };
}

function normalizeNode(node: IrNode): IrNode {
  const children = node.children.map(normalizeNode);
  const notes = [...(node.notes ?? [])].sort((a, b) => a.localeCompare(b));
  const style = normalizeStyle(node.style);
  const provenance = normalizeProvenance(node);
  const status = node.status ?? "ok";

  const base = {
    id: node.id,
    status,
    style,
    provenance,
    notes,
    children,
    ...(node.uncertainty ? { uncertainty: node.uncertainty } : {}),
  };

  switch (node.kind) {
    case "container":
      return { ...base, kind: "container", props: { ...node.props } };
    case "heading":
      return { ...base, kind: "heading", props: { ...node.props } };
    case "text":
      return { ...base, kind: "text", props: { ...node.props } };
    case "image":
      return { ...base, kind: "image", props: { ...node.props } };
    case "button":
      return { ...base, kind: "button", props: { ...node.props } };
    case "link":
      return { ...base, kind: "link", props: { ...node.props } };
    case "list":
      return { ...base, kind: "list", props: { ...node.props } };
    case "list-item":
      return { ...base, kind: "list-item", props: { ...node.props } };
    case "spacer":
      return {
        ...base,
        kind: "spacer",
        props: { ...node.props, axis: node.props.axis ?? "y" },
      };
    case "divider":
      return { ...base, kind: "divider", props: { ...node.props } };
    case "icon":
      return { ...base, kind: "icon", props: { ...node.props } };
    case "html-embed":
      return { ...base, kind: "html-embed", props: { ...node.props } };
    case "group":
      return { ...base, kind: "group", props: { ...node.props } };
    case "unsupported":
      return { ...base, kind: "unsupported", props: { ...node.props } };
  }
}

function compareDiagnostics(a: IrDiagnostic, b: IrDiagnostic): number {
  return (
    a.severity.localeCompare(b.severity) ||
    a.code.localeCompare(b.code) ||
    (a.nodeId ?? "").localeCompare(b.nodeId ?? "") ||
    a.message.localeCompare(b.message)
  );
}

/**
 * Deterministically normalize a validated IR document.
 * Child order is preserved (layout-significant). Arrays that are unordered
 * facts (classNames, notes, diagnostics) are sorted. Empty style groups and
 * empty responsive overrides are removed. Defaults are applied via parse.
 */
export function normalizeIrDocument(input: unknown): IrDocument {
  const parsed = parseIrDocument(input);
  const diagnostics = [...parsed.diagnostics].sort(compareDiagnostics);

  return {
    version: parsed.version,
    meta: {
      sourceLanguage: parsed.meta.sourceLanguage ?? "unknown",
      ...(parsed.meta.sourceName
        ? { sourceName: parsed.meta.sourceName }
        : {}),
      ...(parsed.meta.createdAt ? { createdAt: parsed.meta.createdAt } : {}),
    },
    root: normalizeNode(parsed.root),
    diagnostics,
  };
}

/**
 * Stable JSON string for equality checks across logically identical IR.
 * Object keys are sorted recursively; arrays keep their normalized order.
 */
export function canonicalizeIrJson(input: unknown): string {
  const normalized = normalizeIrDocument(input);
  return JSON.stringify(sortKeysDeep(normalized));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (!isPlainObject(value)) {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortKeysDeep(value[key]);
  }
  return out;
}
