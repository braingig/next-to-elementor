import type { IrNode } from "../../ir/schema";

export type MatchContext = {
  node: IrNode;
  /** Ancestors from root → parent (exclusive of node). */
  ancestors: IrNode[];
};

function classSet(node: IrNode): Set<string> {
  return new Set(node.provenance?.classNames ?? []);
}

function nodeId(node: IrNode): string | undefined {
  return node.provenance?.attributes?.id;
}

function tagName(node: IrNode): string | undefined {
  return node.provenance?.htmlTag?.toLowerCase();
}

/**
 * Match a simple CSS selector against an IR node + ancestor chain.
 * Supports: type, #id, .class, compound, descendant (space), child (>).
 * Returns false for unsupported selector shapes.
 */
export function matchesSelector(selector: string, ctx: MatchContext): boolean {
  const trimmed = selector.trim();
  if (!trimmed) return false;

  // Split by child combinator first, then descendant — MVP left-to-right compound segments.
  if (trimmed.includes(">>") || trimmed.includes("~") || trimmed.includes("+")) {
    return false;
  }

  const childParts = trimmed.split(/\s*>\s*/);
  if (childParts.length > 1) {
    return matchCombinatorChain(childParts, ctx, "child");
  }

  const descParts = trimmed.split(/\s+/).filter(Boolean);
  if (descParts.length > 1) {
    return matchCombinatorChain(descParts, ctx, "descendant");
  }

  return matchCompound(trimmed, ctx.node);
}

function matchCombinatorChain(
  parts: string[],
  ctx: MatchContext,
  mode: "child" | "descendant",
): boolean {
  // Walk from rightmost (subject) leftward through ancestors.
  const subject = parts[parts.length - 1]!;
  if (!matchCompound(subject, ctx.node)) {
    return false;
  }

  let searchPool = [...ctx.ancestors].reverse(); // nearest parent first
  for (let i = parts.length - 2; i >= 0; i -= 1) {
    const part = parts[i]!;
    let foundIndex = -1;
    for (let j = 0; j < searchPool.length; j += 1) {
      if (matchCompound(part, searchPool[j]!)) {
        foundIndex = j;
        break;
      }
      if (mode === "child") {
        // Direct parent must match; only index 0 is allowed.
        return false;
      }
    }
    if (foundIndex < 0) {
      return false;
    }
    if (mode === "child" && foundIndex !== 0) {
      return false;
    }
    searchPool = searchPool.slice(foundIndex + 1);
  }
  return true;
}

function matchCompound(selector: string, node: IrNode): boolean {
  // Strip unsupported pseudos already gated by parse, but be defensive.
  if (/[=*[\]:]/.test(selector.replace(/\[[^\]]+\]/g, ""))) {
    // allow attribute selectors below
  }

  let rest = selector.trim();
  if (!rest || rest === "*") {
    return rest === "*";
  }

  // Attribute [attr=value] or [attr]
  const attrs: Array<{ name: string; value?: string }> = [];
  rest = rest.replace(/\[([a-zA-Z0-9_-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]/g, (_, name, dq, sq, bare) => {
    attrs.push({
      name: String(name),
      value: dq ?? sq ?? bare,
    });
    return "";
  });

  let type: string | undefined;
  const typeMatch = rest.match(/^([a-z][a-z0-9_-]*)/i);
  if (typeMatch) {
    type = typeMatch[1]!.toLowerCase();
    rest = rest.slice(typeMatch[1]!.length);
  }

  const ids = [...rest.matchAll(/#([a-zA-Z0-9_-]+)/g)].map((m) => m[1]!);
  const classes = [...rest.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map((m) => m[1]!);
  // Anything leftover besides empty → unsupported compound
  const leftover = rest.replace(/#[a-zA-Z0-9_-]+/g, "").replace(/\.[a-zA-Z0-9_-]+/g, "");
  if (leftover.trim()) {
    return false;
  }

  if (type && tagName(node) !== type) {
    return false;
  }
  for (const id of ids) {
    if (nodeId(node) !== id) return false;
  }
  const classesOnNode = classSet(node);
  for (const cls of classes) {
    if (!classesOnNode.has(cls)) return false;
  }
  for (const attr of attrs) {
    const actual = node.provenance?.attributes?.[attr.name];
    if (attr.value == null) {
      if (actual == null) return false;
    } else if (actual !== attr.value) {
      return false;
    }
  }
  return true;
}

export function compareCascade(
  a: { specificity: [number, number, number]; order: number },
  b: { specificity: [number, number, number]; order: number },
): number {
  for (let i = 0; i < 3; i += 1) {
    const d = a.specificity[i]! - b.specificity[i]!;
    if (d !== 0) return d;
  }
  return a.order - b.order;
}
