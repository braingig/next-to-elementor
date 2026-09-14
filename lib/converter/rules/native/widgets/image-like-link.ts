/**
 * Detect IR `link` nodes whose meaningful content is a single static image
 * (optionally wrapped in trivial containers, with visually-hidden siblings).
 *
 * Free has no Link widget, but Image supports `link_to: custom` + URL.
 * Conservative: any extra visible non-image content keeps the link on the
 * custom-HTML fallback path.
 */

import type { IrNode } from "../../../ir/schema";

export type ImageLikeLinkExtract = {
  image: IrNode & { kind: "image" };
  href: string;
  target?: string;
  rel?: string;
};

function classSet(node: IrNode): Set<string> {
  return new Set(node.provenance?.classNames ?? []);
}

/** True when the node is intended to be invisible (sr-only / display:none). */
export function isVisuallyHiddenNode(node: IrNode): boolean {
  if (node.style?.layout?.display === "none") return true;
  const classes = classSet(node);
  if (classes.has("sr-only") || classes.has("screen-reader-text")) return true;
  // Responsive-only hide without a show breakpoint still counts as hidden base.
  if (
    node.style?.layout?.display === undefined &&
    classes.has("hidden") &&
    ![...classes].some((c) => /^(sm|md|lg|xl|2xl):/.test(c))
  ) {
    return true;
  }
  return false;
}

function visibleChildren(node: IrNode): IrNode[] {
  return node.children.filter((c) => !isVisuallyHiddenNode(c));
}

/**
 * Dig through container/group wrappers that only exist to hold the image.
 * Stops when more than one visible child remains (ambiguous layout).
 */
export function unwrapToSingleImage(
  node: IrNode,
): (IrNode & { kind: "image" }) | null {
  let cur: IrNode = node;
  for (let depth = 0; depth < 8; depth += 1) {
    if (cur.kind === "image") {
      return cur as IrNode & { kind: "image" };
    }
    if (cur.kind !== "container" && cur.kind !== "group") {
      return null;
    }
    const kids = visibleChildren(cur);
    if (kids.length !== 1) return null;
    cur = kids[0]!;
  }
  return null;
}

/**
 * If `node` is a link whose only meaningful content is one image, return it.
 * Ignores visually-hidden siblings (e.g. sr-only accessible name next to the image).
 */
export function extractImageLikeLink(
  node: IrNode,
): ImageLikeLinkExtract | null {
  if (node.kind !== "link") return null;
  const href = node.props.href?.trim();
  if (!href) return null;

  const visible = visibleChildren(node);
  if (visible.length === 0) {
    // Bare text-only link with no element children is not an image link.
    return null;
  }
  if (visible.length !== 1) return null;

  const image = unwrapToSingleImage(visible[0]!);
  if (!image) return null;
  if (!image.props.src) return null;

  return {
    image,
    href,
    ...(node.props.target ? { target: node.props.target } : {}),
    ...(node.props.rel ? { rel: node.props.rel } : {}),
  };
}
