import type { IrNode } from "../../../ir/schema";
import type { ElementorFreeCatalog } from "../../../catalog/schema";
import { canUseControl, canUseWidget } from "../../../catalog/compliance";
import { mapIrStyleToSettings } from "../styles/map-style";
import { mapAlign, toSlider, toUrl } from "../styles/values";
import type { ElementorSettings, NativeNodeDecision } from "../types";
import { elementorIdFromIrId } from "../types";

export type NativeElementDraft = {
  id: string;
  elType: "container" | "widget";
  widgetType?: string;
  settings: ElementorSettings;
  elements: NativeElementDraft[];
};

export type NativeEmit = {
  decision: NativeNodeDecision;
  /** Present when strategy is `native` or Phase 6 `custom` */
  element?: NativeElementDraft;
};

function nonNative(
  node: IrNode,
  strategy: "needs-fallback" | "unsupported",
  message: string,
  reasonCode: NativeNodeDecision["reasonCode"],
): NativeEmit {
  return {
    decision: {
      nodeId: node.id,
      irKind: node.kind,
      strategy,
      reasonCode,
      message,
    },
  };
}

function ensureWidget(
  catalog: ElementorFreeCatalog,
  widgetId: string,
  node: IrNode,
): NativeEmit | null {
  if (!canUseWidget(catalog, widgetId)) {
    return nonNative(
      node,
      "unsupported",
      `Widget "${widgetId}" is not Free-allowed in catalog ${catalog.elementorTarget}.`,
      "pro-only-feature",
    );
  }
  return null;
}

export function convertHeading(
  node: IrNode & { kind: "heading" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const blocked = ensureWidget(catalog, "heading", node);
  if (blocked) return blocked;

  const settings: ElementorSettings = {
    ...mapIrStyleToSettings(node.style, {
      catalog,
      widgetId: "heading",
      spacingPrefix: "_",
      backgroundPrefix: "_",
    }),
    title: node.props.text,
    header_size: `h${node.props.level}`,
  };

  if (node.props.html) {
    // Prefer plain title; html optional — if present use title text still for native accuracy
  }

  // Heading catalog uses start/end; remap after cascade so responsive
  // desktop (e.g. lg:text-left) is not overwritten by the base IR value.
  for (const key of ["align", "align_tablet", "align_mobile"] as const) {
    const v = settings[key];
    if (v === "left") settings[key] = "start";
    else if (v === "right") settings[key] = "end";
  }

  if (node.style?.typography?.color) {
    settings.title_color = node.style.typography.color;
  }

  return {
    decision: {
      nodeId: node.id,
      irKind: "heading",
      strategy: "native",
      elementorType: "heading",
      settings,
      message: "Mapped to Free Heading widget.",
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "widget",
      widgetType: "heading",
      settings,
      elements: [],
    },
  };
}

export function convertText(
  node: IrNode & { kind: "text" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const blocked = ensureWidget(catalog, "text-editor", node);
  if (blocked) return blocked;

  const settings: ElementorSettings = {
    ...mapIrStyleToSettings(node.style, {
      catalog,
      widgetId: "text-editor",
      spacingPrefix: "_",
      backgroundPrefix: "_",
    }),
    editor: node.props.html ?? node.props.text,
  };

  if (node.style?.typography?.color) {
    settings.text_color = node.style.typography.color;
  }

  return {
    decision: {
      nodeId: node.id,
      irKind: "text",
      strategy: "native",
      elementorType: "text-editor",
      settings,
      message: "Mapped to Free Text Editor widget.",
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "widget",
      widgetType: "text-editor",
      settings,
      elements: [],
    },
  };
}

export function convertImage(
  node: IrNode & { kind: "image" },
  catalog: ElementorFreeCatalog,
  linkOpts?: { href: string; target?: string; rel?: string },
): NativeEmit {
  const blocked = ensureWidget(catalog, "image", node);
  if (blocked) return blocked;

  if (!node.props.src) {
    return nonNative(
      node,
      "unsupported",
      "Image is missing src; cannot emit Free Image without inventing a URL.",
      "asset-unresolved",
    );
  }

  const settings: ElementorSettings = {
    ...mapIrStyleToSettings(node.style, {
      catalog,
      widgetId: "image",
      spacingPrefix: "_",
      backgroundPrefix: "_",
    }),
    // No WordPress attachment id — URL-only media object.
    image: {
      url: node.props.src,
      id: "",
      alt: node.props.alt ?? "",
      source: "url",
    },
    image_size: "full",
    caption_source: "none",
    link_to: "none",
  };

  // When a utility height is present (e.g. h-12) and width is auto/unspecified,
  // keep aspect via object-fit rather than stretching to intrinsic asset size.
  if (
    settings.height &&
    canUseControl(catalog, "image", "object-fit") &&
    settings["object-fit"] == null
  ) {
    const width = node.style?.box?.width;
    if (!width || width === "auto" || width === "fit-content") {
      settings["object-fit"] = "contain";
    }
  }
  // Prefer explicit IR object-fit / object-position from Tailwind/CSS.
  if (
    node.style?.box?.objectFit &&
    canUseControl(catalog, "image", "object-fit")
  ) {
    const fit = node.style.box.objectFit;
    if (
      fit === "fill" ||
      fit === "cover" ||
      fit === "contain" ||
      fit === "scale-down"
    ) {
      settings["object-fit"] = fit;
    }
  }
  if (
    node.style?.box?.objectPosition &&
    canUseControl(catalog, "image", "object-position")
  ) {
    settings["object-position"] = node.style.box.objectPosition;
  }

  if (linkOpts?.href) {
    const link = toUrl(linkOpts.href, {
      target: linkOpts.target,
      rel: linkOpts.rel,
    });
    if (link && canUseControl(catalog, "image", "link_to")) {
      settings.link_to = "custom";
      if (canUseControl(catalog, "image", "link")) {
        settings.link = link;
      }
    }
  }

  const align = mapAlign(node.style?.typography?.textAlign);
  if (align) {
    settings.align =
      align === "left" ? "left" : align === "right" ? "right" : align;
  }

  return {
    decision: {
      nodeId: node.id,
      irKind: linkOpts?.href ? "link" : "image",
      strategy: "native",
      elementorType: "image",
      settings,
      message: linkOpts?.href
        ? "Mapped image-like IR link to Free Image widget with custom link URL."
        : "Mapped to Free Image widget (URL media; no attachment id).",
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "widget",
      widgetType: "image",
      settings,
      elements: [],
    },
  };
}

export function convertButton(
  node: IrNode & { kind: "button" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const blocked = ensureWidget(catalog, "button", node);
  if (blocked) return blocked;

  const settings: ElementorSettings = {
    ...mapIrStyleToSettings(node.style, {
      catalog,
      widgetId: "button",
      spacingPrefix: "_",
      backgroundPrefix: "",
    }),
    text: node.props.text,
  };

  const link = toUrl(node.props.href, {
    target: node.props.target,
    rel: node.props.rel,
  });
  if (link) {
    settings.link = link;
    settings.button_type = "";
  }

  if (node.style?.typography?.color) {
    settings.button_text_color = node.style.typography.color;
  }
  if (node.style?.background?.color) {
    settings.background_background = "classic";
    settings.background_color = node.style.background.color;
  }
  if (
    node.props.iconName &&
    canUseControl(catalog, "button", "selected_icon")
  ) {
    settings.selected_icon = {
      value: `fas fa-${node.props.iconName}`,
      library: "fa-solid",
    };
    if (canUseControl(catalog, "button", "icon_align")) {
      settings.icon_align = "left";
    }
  }

  const align = mapAlign(node.style?.typography?.textAlign);
  if (align) {
    settings.align =
      align === "left" ? "left" : align === "right" ? "right" : align;
  }

  // Prefer text_padding from padding box when present
  return {
    decision: {
      nodeId: node.id,
      irKind: "button",
      strategy: "native",
      elementorType: "button",
      settings,
      message: "Mapped to Free Button widget.",
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "widget",
      widgetType: "button",
      settings,
      elements: [],
    },
  };
}

export function convertIcon(
  node: IrNode & { kind: "icon" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const blocked = ensureWidget(catalog, "icon", node);
  if (blocked) return blocked;

  // Only native when we have a concrete icon name — do not invent libraries.
  if (!node.props.name) {
    return nonNative(
      node,
      "needs-fallback",
      "Icon lacks a named icon library entry; SVG/raw icons need Phase 6 fallback.",
      "svg-complex",
    );
  }

  const settings: ElementorSettings = {
    ...mapIrStyleToSettings(node.style, {
      catalog,
      widgetId: "icon",
      spacingPrefix: "_",
      backgroundPrefix: "_",
    }),
    selected_icon: {
      value: `fas fa-${node.props.name}`,
      library: "fa-solid",
    },
    view: "default",
  };

  if (node.style?.typography?.color) {
    settings.primary_color = node.style.typography.color;
  }
  const iconSize =
    node.style?.box?.width && node.style.box.width !== "auto"
      ? node.style.box.width
      : node.style?.box?.height && node.style.box.height !== "auto"
        ? node.style.box.height
        : undefined;
  if (iconSize && canUseControl(catalog, "icon", "size")) {
    const slider = toSlider(iconSize);
    if (slider) settings.size = slider;
  }

  return {
    decision: {
      nodeId: node.id,
      irKind: "icon",
      strategy: "native",
      elementorType: "icon",
      settings,
      message: `Mapped to Free Icon widget using name "${node.props.name}".`,
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "widget",
      widgetType: "icon",
      settings,
      elements: [],
    },
  };
}

export function convertDivider(
  node: IrNode & { kind: "divider" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const blocked = ensureWidget(catalog, "divider", node);
  if (blocked) return blocked;

  const settings: ElementorSettings = {
    ...mapIrStyleToSettings(node.style, {
      catalog,
      widgetId: "divider",
      spacingPrefix: "_",
      backgroundPrefix: "_",
    }),
    style: node.style?.border?.style === "dashed" ? "dashed" : "solid",
    look: "line",
  };

  if (node.style?.border?.color) {
    settings.color = node.style.border.color;
  }

  return {
    decision: {
      nodeId: node.id,
      irKind: "divider",
      strategy: "native",
      elementorType: "divider",
      settings,
      message: "Mapped to Free Divider widget.",
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "widget",
      widgetType: "divider",
      settings,
      elements: [],
    },
  };
}

export function convertSpacer(
  node: IrNode & { kind: "spacer" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const blocked = ensureWidget(catalog, "spacer", node);
  if (blocked) return blocked;

  const settings: ElementorSettings = {
    ...mapIrStyleToSettings(node.style, {
      catalog,
      widgetId: "spacer",
      spacingPrefix: "_",
      backgroundPrefix: "_",
    }),
  };

  const size = node.props.size ?? node.style?.box?.height;
  const slider = toSlider(size);
  if (slider) {
    settings.space = slider;
  }

  return {
    decision: {
      nodeId: node.id,
      irKind: "spacer",
      strategy: "native",
      elementorType: "spacer",
      settings,
      message: "Mapped to Free Spacer widget.",
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "widget",
      widgetType: "spacer",
      settings,
      elements: [],
    },
  };
}

export function convertHtmlEmbed(
  node: IrNode & { kind: "html-embed" },
  catalog: ElementorFreeCatalog,
): NativeEmit {
  const blocked = ensureWidget(catalog, "html", node);
  if (blocked) return blocked;

  const settings: ElementorSettings = {
    html: node.props.html,
  };

  return {
    decision: {
      nodeId: node.id,
      irKind: "html-embed",
      strategy: "native",
      elementorType: "html",
      settings,
      message: "Mapped IR html-embed to Free HTML widget (explicit embed only).",
    },
    element: {
      id: elementorIdFromIrId(node.id),
      elType: "widget",
      widgetType: "html",
      settings,
      elements: [],
    },
  };
}

export { nonNative, ensureWidget };
