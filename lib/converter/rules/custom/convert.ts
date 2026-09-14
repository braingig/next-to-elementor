import type { IrNode } from "../../ir/schema";
import type { ElementorFreeCatalog } from "../../catalog/schema";
import { canUseWidget } from "../../catalog/compliance";
import {
  elementorIdFromIrId,
  type ElementorSettings,
  type NativeNodeDecision,
} from "../native/types";
import type { NativeEmit } from "../native/widgets/leaf";
import { mapIrStyleToSettings } from "../native/styles/map-style";
import { serializeSubtreeScopedCss } from "./css";
import { serializeIrNodeHtml } from "./html";
import { findUnsafeCustomPatterns } from "./safety";

function hrefOf(node: IrNode): string | undefined {
  if (node.kind === "link") return node.props.href;
  if (node.kind === "button") return node.props.href;
  return node.provenance?.attributes?.href;
}

function collectUnsafeFromTree(
  node: IrNode,
): ReturnType<typeof findUnsafeCustomPatterns> {
  const local = findUnsafeCustomPatterns({
    html:
      node.kind === "html-embed"
        ? node.props.html
        : node.kind === "icon"
          ? node.props.svg
          : node.kind === "text"
            ? node.props.html
            : undefined,
    attributes: node.provenance?.attributes,
    href: hrefOf(node),
  });
  if (local) return local;
  for (const child of node.children) {
    const nested = collectUnsafeFromTree(child);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Attempt node-scoped custom fallback using Free `html` widget.
 * Called only after the native layer returns `needs-fallback`.
 */
export function convertCustomFallback(
  node: IrNode,
  catalog: ElementorFreeCatalog,
  nativeMessage?: string,
): NativeEmit {
  if (!canUseWidget(catalog, "html")) {
    return {
      decision: {
        nodeId: node.id,
        irKind: node.kind,
        strategy: "unsupported",
        reasonCode: "pro-only-feature",
        message: "Free HTML widget is not available in the catalog.",
      },
    };
  }

  if (node.kind === "unsupported") {
    return {
      decision: {
        nodeId: node.id,
        irKind: node.kind,
        strategy: "unsupported",
        reasonCode: node.props.reasonCode,
        message: node.props.message,
      },
    };
  }

  const unsafe = collectUnsafeFromTree(node);
  if (unsafe) {
    return {
      decision: {
        nodeId: node.id,
        irKind: node.kind,
        strategy: "unsupported",
        reasonCode: unsafe.code,
        message: unsafe.message,
      },
    };
  }

  const scopeId = elementorIdFromIrId(node.id);
  const scopeClass = `nte-fb-${scopeId}`;

  let body: string;
  try {
    body = serializeIrNodeHtml(node, scopeClass);
  } catch {
    return {
      decision: {
        nodeId: node.id,
        irKind: node.kind,
        strategy: "unsupported",
        reasonCode: "custom-fallback-unavailable",
        message: "Failed to serialize IR node to HTML for custom fallback.",
      },
    };
  }

  const postUnsafe = findUnsafeCustomPatterns({ html: body });
  if (postUnsafe) {
    return {
      decision: {
        nodeId: node.id,
        irKind: node.kind,
        strategy: "unsupported",
        reasonCode: postUnsafe.code,
        message: postUnsafe.message,
      },
    };
  }

  // Emit scoped CSS for the entire fallback subtree from resolved IrStyle —
  // never dump global stylesheets; never leave dead Tailwind classes on children.
  const css = serializeSubtreeScopedCss(scopeClass, node);
  const html = css ? `${body}<style>${css}</style>` : body;
  const styleSettings = mapIrStyleToSettings(node.style, {
    catalog,
    widgetId: "html",
    spacingPrefix: "_",
  });
  const settings: ElementorSettings = { html };
  // Only Elementor placement chrome — visual styles live in scoped CSS.
  // Absolute/fixed HTML siblings must keep Free `_position` / `_z_index` so a
  // native parent can host them without absorbing the whole subtree.
  for (const key of Object.keys(styleSettings)) {
    if (
      /^(hide_desktop|hide_tablet|hide_mobile|_position|_z_index|_offset_x|_offset_y|_element_width|_element_custom_width|width)$/.test(
        key,
      ) ||
      /^(hide_desktop|hide_tablet|hide_mobile|_position|_z_index|_offset_x|_offset_y|_element_width|_element_custom_width|width)_(tablet|mobile)$/.test(
        key,
      )
    ) {
      if (styleSettings[key] != null) {
        settings[key] = styleSettings[key];
      }
    }
  }

  const decision: NativeNodeDecision = {
    nodeId: node.id,
    irKind: node.kind,
    strategy: "custom",
    elementorType: "html",
    settings,
    message:
      nativeMessage ??
      "Emitted as node-scoped Free HTML widget custom fallback.",
  };

  return {
    decision,
    element: {
      id: scopeId,
      elType: "widget",
      widgetType: "html",
      settings,
      elements: [],
    },
  };
}
