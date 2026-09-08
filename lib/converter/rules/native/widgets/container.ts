import type { IrNode } from "../../../ir/schema";
import type { ElementorFreeCatalog } from "../../../catalog/schema";
import { mapIrStyleToSettings } from "../styles/map-style";
import type { NativeEmit } from "./leaf";
import {
  convertButton,
  convertDivider,
  convertHeading,
  convertHtmlEmbed,
  convertIcon,
  convertImage,
  convertSpacer,
  convertText,
  ensureWidget,
  nonNative,
} from "./leaf";
import { elementorIdFromIrId } from "../types";

/** Child converter hook — Phase 6 injects native→custom→unsupported. */
export type IrNodeConverter = (
  node: IrNode,
  catalog: ElementorFreeCatalog,
) => NativeEmit;

function convertChildren(
  nodes: IrNode[],
  catalog: ElementorFreeCatalog,
  convertChild: IrNodeConverter,
): { emits: NativeEmit[]; decisions: NativeEmit["decision"][] } {
  const emits: NativeEmit[] = [];
  const decisions: NativeEmit["decision"][] = [];
  for (const child of nodes) {
    const emit = convertChild(child, catalog);
    emits.push(emit);
    decisions.push(emit.decision);
  }
  return { emits, decisions };
}

/**
 * Leaf Free widgets cannot host Elementor children. If the IR still has
 * nested nodes, defer to custom HTML so content is preserved and covered.
 */
function requireLeafWithoutChildren(
  node: IrNode,
  catalog: ElementorFreeCatalog,
  convertLeaf: () => NativeEmit,
): NativeEmit {
  if (node.children.length > 0) {
    return nonNative(
      node,
      "needs-fallback",
      `IR ${node.kind} has nested children that cannot be represented inside a Free leaf widget; using node-scoped HTML fallback to preserve the subtree.`,
      "semantic-ambiguous",
    );
  }
  void catalog;
  return convertLeaf();
}

export function convertContainerLike(
  node: IrNode & { kind: "container" | "group" },
  catalog: ElementorFreeCatalog,
  convertChild: IrNodeConverter = convertIrNode,
): NativeEmit {
  const blocked = ensureWidget(catalog, "container", node);
  if (blocked) return blocked;

  // Uncertain groups without clear layout → fallback
  if (node.kind === "group" && node.status === "uncertain") {
    return nonNative(
      node,
      "needs-fallback",
      "Uncertain group cannot be accurately mapped to a Free Container.",
      "semantic-ambiguous",
    );
  }

  const settings = mapIrStyleToSettings(node.style, {
    catalog,
    widgetId: "container",
    spacingPrefix: "",
    backgroundPrefix: "",
  });

  // Default flex container when layout display missing but children present.
  // Do NOT invent flex_direction: Elementor's unset direction behaves as column
  // for structural wrappers; explicit `display:flex` without direction emits row
  // from mapIrStyleToSettings (CSS/Tailwind default).
  if (!settings.container_type) {
    settings.container_type = "flex";
  }
  if (!settings.content_width) {
    settings.content_width = "full";
  }

  if (node.props.as && ["section", "header", "footer", "main", "article", "aside", "nav", "div"].includes(node.props.as)) {
    settings.html_tag = node.props.as === "div" ? "div" : node.props.as;
  }

  const { emits, decisions } = convertChildren(
    node.children,
    catalog,
    convertChild,
  );
  const emittedChildren = emits
    .map((e) => e.element)
    .filter((el): el is NonNullable<typeof el> => Boolean(el));

  return {
    decision: {
      nodeId: node.id,
      irKind: node.kind,
      strategy: "native",
      elementorType: "container",
      settings,
      message: "Mapped to Free Container.",
      children: decisions,
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "container",
      settings,
      elements: emittedChildren,
    },
  };
}

export function convertIrNode(
  node: IrNode,
  catalog: ElementorFreeCatalog,
  convertChild: IrNodeConverter = convertIrNode,
): NativeEmit {
  if (node.kind === "unsupported") {
    return nonNative(
      node,
      "unsupported",
      node.props.message,
      node.props.reasonCode,
    );
  }

  if (node.status === "uncertain" && node.kind !== "group") {
    // Still try native for clear kinds; uncertain group handled above
  }

  switch (node.kind) {
    case "container":
    case "group":
      return convertContainerLike(node, catalog, convertChild);
    case "heading":
      return requireLeafWithoutChildren(node, catalog, () =>
        convertHeading(node, catalog),
      );
    case "text":
      return requireLeafWithoutChildren(node, catalog, () =>
        convertText(node, catalog),
      );
    case "image":
      return requireLeafWithoutChildren(node, catalog, () =>
        convertImage(node, catalog),
      );
    case "button":
      return requireLeafWithoutChildren(node, catalog, () =>
        convertButton(node, catalog),
      );
    case "link":
      return nonNative(
        node,
        "needs-fallback",
        "IR link has no dedicated Free Link widget; converting to Button would change semantics. Deferred to Phase 6.",
        "semantic-ambiguous",
      );
    case "icon":
      return requireLeafWithoutChildren(node, catalog, () =>
        convertIcon(node, catalog),
      );
    case "divider":
      return requireLeafWithoutChildren(node, catalog, () =>
        convertDivider(node, catalog),
      );
    case "spacer":
      return requireLeafWithoutChildren(node, catalog, () =>
        convertSpacerFixed(node, catalog),
      );
    case "html-embed":
      return requireLeafWithoutChildren(node, catalog, () =>
        convertHtmlEmbed(node, catalog),
      );
    case "list":
    case "list-item":
      return nonNative(
        node,
        "needs-fallback",
        `IR kind "${node.kind}" is not in the MVP Free native widget set.`,
        "layout-unsupported",
      );
    default:
      return nonNative(
        node,
        "unsupported",
        `Unknown IR kind cannot be converted natively.`,
        "unsupported-node-kind",
      );
  }
}

function convertSpacerFixed(
  node: IrNode & { kind: "spacer" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  return convertSpacer(node, catalog);
}
