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

function convertChildren(
  nodes: IrNode[],
  catalog: ElementorFreeCatalog,
): { emits: NativeEmit[]; decisions: NativeEmit["decision"][] } {
  const emits: NativeEmit[] = [];
  const decisions: NativeEmit["decision"][] = [];
  for (const child of nodes) {
    const emit = convertIrNode(child, catalog);
    emits.push(emit);
    decisions.push(emit.decision);
    if (emit.decision.children) {
      // already nested in decision
    }
  }
  return { emits, decisions };
}

export function convertContainerLike(
  node: IrNode & { kind: "container" | "group" },
  catalog: ElementorFreeCatalog,
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

  // Default flex container when layout display missing but children present
  if (!settings.container_type) {
    settings.container_type = "flex";
  }
  if (!settings.content_width) {
    settings.content_width = "full";
  }
  if (!settings.flex_direction && settings.container_type === "flex") {
    settings.flex_direction = "column";
  }

  if (node.props.as && ["section", "header", "footer", "main", "article", "aside", "nav", "div"].includes(node.props.as)) {
    settings.html_tag = node.props.as === "div" ? "div" : node.props.as;
  }

  const { emits, decisions } = convertChildren(node.children, catalog);
  const nativeChildren = emits
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
      elements: nativeChildren,
    },
  };
}

export function convertIrNode(
  node: IrNode,
  catalog: ElementorFreeCatalog,
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
      return convertContainerLike(node, catalog);
    case "heading":
      return convertHeading(node, catalog);
    case "text":
      return convertText(node, catalog);
    case "image":
      return convertImage(node, catalog);
    case "button":
      return convertButton(node, catalog);
    case "link":
      return nonNative(
        node,
        "needs-fallback",
        "IR link has no dedicated Free Link widget; converting to Button would change semantics. Deferred to Phase 6.",
        "semantic-ambiguous",
      );
    case "icon":
      return convertIcon(node, catalog);
    case "divider":
      return convertDivider(node, catalog);
    case "spacer":
      return convertSpacerFixed(node, catalog);
    case "html-embed":
      return convertHtmlEmbed(node, catalog);
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
        "other",
      );
  }
}

function convertSpacerFixed(
  node: IrNode & { kind: "spacer" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  return convertSpacer(node, catalog);
}
