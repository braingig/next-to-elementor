import type { IrNode } from "../../../ir/schema";
import type { ElementorFreeCatalog } from "../../../catalog/schema";
import { canUseControl } from "../../../catalog/compliance";
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
import {
  isButtonLikeLink,
  linkNodeAsButton,
} from "./button-like-link";
import {
  shouldPropagateContainerTextAlign,
  withInheritedParentTextAlign,
} from "./inherit-text-align";
import {
  applyFlexRowChildShrinkWrap,
  applyFlexRowLeafShrinkWrap,
  applyFlexRowNowrapDefault,
} from "./flex-child-width";
import { applyHorizontalLayoutInference } from "./layout-inference";
import { absorbFullBleedBackground } from "./full-bleed-background";
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
  // flex_direction is inferred conservatively after children convert
  // (see applyHorizontalLayoutInference) — Elementor unset ≈ column.
  if (!settings.container_type) {
    settings.container_type = "flex";
  }
  if (!settings.content_width) {
    settings.content_width = "full";
  }

  if (node.props.as && ["section", "header", "footer", "main", "article", "aside", "nav", "div"].includes(node.props.as)) {
    settings.html_tag = node.props.as === "div" ? "div" : node.props.as;
  }

  // Free Container cannot emit native `align`; CSS text-align would still
  // inherit to typographic children — mirror that for Heading / Text Editor.
  const children = shouldPropagateContainerTextAlign(
    canUseControl(catalog, "container", "align"),
    node.style,
  )
    ? node.children.map((c) => withInheritedParentTextAlign(node.style, c))
    : node.children;

  const { emits, decisions } = convertChildren(
    children,
    catalog,
    convertChild,
  );

  // Absolute inset-0 cover <img> + empty overlay → Container background_*
  // (Free-compatible full-bleed hero) instead of broken absolute Image widgets.
  const absorbed = absorbFullBleedBackground({
    parent: node,
    catalog,
    settings,
    irChildren: children,
    emits,
  });
  const emittedChildren = absorbed.children;
  const childDecisions = absorbed.childDecisions;

  // Infer row / grid columns from cues + child shape (never global flex→row).
  applyHorizontalLayoutInference({
    node,
    settings,
    children: emittedChildren,
  });

  // CSS/Tailwind flex default is nowrap; Elementor row forces mobile wrap.
  applyFlexRowNowrapDefault(settings);

  // Flex-row child containers default to 100% width in Elementor Free CSS;
  // shrink-wrap clusters that have no explicit IR width so justify-between
  // bars (navbars) stay horizontal on mobile.
  applyFlexRowChildShrinkWrap(settings, emittedChildren);

  // Leaf widgets (html/button/icon/image) also default to flex-grow in row
  // mode — set _element_width:auto so nav links/CTAs hug content.
  applyFlexRowLeafShrinkWrap(settings, emittedChildren);

  let message = "Mapped to Free Container.";
  if (absorbed.absorbedImage || absorbed.absorbedOverlay) {
    const bits = [
      absorbed.absorbedImage ? "cover background image" : null,
      absorbed.absorbedOverlay ? "background overlay" : null,
    ].filter(Boolean);
    message = `Mapped to Free Container (${bits.join(" + ")} absorbed from absolute children).`;
  }

  return {
    decision: {
      nodeId: node.id,
      irKind: node.kind,
      strategy: "native",
      elementorType: "container",
      settings,
      message,
      children: childDecisions,
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
      return convertLinkNode(node, catalog);
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

function convertLinkNode(
  node: IrNode & { kind: "link" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  if (isButtonLikeLink(node)) {
    return requireLeafWithoutChildren(node, catalog, () => {
      const asButton = linkNodeAsButton(node);
      const emit = convertButton(asButton, catalog);
      if (emit.decision.strategy === "native") {
        return {
          ...emit,
          decision: {
            ...emit.decision,
            irKind: "link",
            message:
              "Mapped button-like IR link to Free Button widget (filled/outlined chrome + padding).",
          },
        };
      }
      return emit;
    });
  }

  return nonNative(
    node,
    "needs-fallback",
    "IR link has no dedicated Free Link widget; anchor lacks button-like chrome for a faithful Button mapping.",
    "semantic-ambiguous",
  );
}

function convertSpacerFixed(
  node: IrNode & { kind: "spacer" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  return convertSpacer(node, catalog);
}
