import { z } from "zod";
import {
  DiagnosticSeveritySchema,
  UnsupportedReasonCodeSchema,
} from "../types/decisions";

/** IR schema version for this contract freeze. */
export const IR_SCHEMA_VERSION = "0.1.0" as const;

export const IrNodeKindSchema = z.enum([
  "container",
  "heading",
  "text",
  "image",
  "button",
  "link",
  "list",
  "list-item",
  "spacer",
  "divider",
  "icon",
  "html-embed",
  "group",
  "unsupported",
]);
export type IrNodeKind = z.infer<typeof IrNodeKindSchema>;

export const IrSourceLanguageSchema = z.enum(["tsx", "jsx", "unknown"]);
export type IrSourceLanguage = z.infer<typeof IrSourceLanguageSchema>;

export const IrSourceLocationSchema = z
  .object({
    line: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    endLine: z.number().int().nonnegative().optional(),
    endColumn: z.number().int().nonnegative().optional(),
  })
  .strict();
export type IrSourceLocation = z.infer<typeof IrSourceLocationSchema>;

export const IrProvenanceSchema = z
  .object({
    sourcePath: z.string().optional(),
    loc: IrSourceLocationSchema.optional(),
    componentName: z.string().optional(),
    htmlTag: z.string().optional(),
    classNames: z.array(z.string()).default([]),
    inlineStyleRaw: z.string().optional(),
  })
  .strict();
export type IrProvenance = z.infer<typeof IrProvenanceSchema>;

export const IrDiagnosticSchema = z
  .object({
    severity: DiagnosticSeveritySchema,
    code: z.string().min(1),
    message: z.string().min(1),
    nodeId: z.string().optional(),
    loc: IrSourceLocationSchema.optional(),
  })
  .strict();
export type IrDiagnostic = z.infer<typeof IrDiagnosticSchema>;

/** Length/color/etc. as normalized CSS-ish strings for MVP. */
const CssValue = z.string();

export const IrBoxStyleSchema = z
  .object({
    width: CssValue.optional(),
    height: CssValue.optional(),
    minWidth: CssValue.optional(),
    minHeight: CssValue.optional(),
    maxWidth: CssValue.optional(),
    maxHeight: CssValue.optional(),
    margin: CssValue.optional(),
    marginTop: CssValue.optional(),
    marginRight: CssValue.optional(),
    marginBottom: CssValue.optional(),
    marginLeft: CssValue.optional(),
    padding: CssValue.optional(),
    paddingTop: CssValue.optional(),
    paddingRight: CssValue.optional(),
    paddingBottom: CssValue.optional(),
    paddingLeft: CssValue.optional(),
  })
  .strict();

export const IrLayoutStyleSchema = z
  .object({
    display: CssValue.optional(),
    flexDirection: CssValue.optional(),
    flexWrap: CssValue.optional(),
    justifyContent: CssValue.optional(),
    alignItems: CssValue.optional(),
    alignContent: CssValue.optional(),
    gap: CssValue.optional(),
    rowGap: CssValue.optional(),
    columnGap: CssValue.optional(),
    gridTemplateColumns: CssValue.optional(),
    gridTemplateRows: CssValue.optional(),
    overflow: CssValue.optional(),
  })
  .strict();

export const IrTypographyStyleSchema = z
  .object({
    fontFamily: CssValue.optional(),
    fontSize: CssValue.optional(),
    fontWeight: CssValue.optional(),
    fontStyle: CssValue.optional(),
    lineHeight: CssValue.optional(),
    letterSpacing: CssValue.optional(),
    textAlign: CssValue.optional(),
    textDecoration: CssValue.optional(),
    textTransform: CssValue.optional(),
    color: CssValue.optional(),
  })
  .strict();

export const IrBackgroundStyleSchema = z
  .object({
    color: CssValue.optional(),
    image: CssValue.optional(),
    size: CssValue.optional(),
    position: CssValue.optional(),
    repeat: CssValue.optional(),
  })
  .strict();

export const IrBorderStyleSchema = z
  .object({
    width: CssValue.optional(),
    style: CssValue.optional(),
    color: CssValue.optional(),
    radius: CssValue.optional(),
    topLeftRadius: CssValue.optional(),
    topRightRadius: CssValue.optional(),
    bottomRightRadius: CssValue.optional(),
    bottomLeftRadius: CssValue.optional(),
  })
  .strict();

export const IrPositionStyleSchema = z
  .object({
    position: CssValue.optional(),
    top: CssValue.optional(),
    right: CssValue.optional(),
    bottom: CssValue.optional(),
    left: CssValue.optional(),
    zIndex: CssValue.optional(),
  })
  .strict();

export const IrEffectsStyleSchema = z
  .object({
    opacity: CssValue.optional(),
    boxShadow: CssValue.optional(),
    transform: CssValue.optional(),
    /** MVP: flags only — full timelines are out of scope. */
    hasTransition: z.boolean().optional(),
    hasAnimation: z.boolean().optional(),
  })
  .strict();

export const IrResponsiveBreakpointSchema = z.enum([
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
]);
export type IrResponsiveBreakpoint = z.infer<typeof IrResponsiveBreakpointSchema>;

type IrStyle = {
  box?: z.infer<typeof IrBoxStyleSchema>;
  layout?: z.infer<typeof IrLayoutStyleSchema>;
  typography?: z.infer<typeof IrTypographyStyleSchema>;
  background?: z.infer<typeof IrBackgroundStyleSchema>;
  border?: z.infer<typeof IrBorderStyleSchema>;
  position?: z.infer<typeof IrPositionStyleSchema>;
  effects?: z.infer<typeof IrEffectsStyleSchema>;
  responsive?: Partial<Record<IrResponsiveBreakpoint, IrStyle>>;
};

export const IrStyleSchema: z.ZodType<IrStyle> = z.lazy(() =>
  z
    .object({
      box: IrBoxStyleSchema.optional(),
      layout: IrLayoutStyleSchema.optional(),
      typography: IrTypographyStyleSchema.optional(),
      background: IrBackgroundStyleSchema.optional(),
      border: IrBorderStyleSchema.optional(),
      position: IrPositionStyleSchema.optional(),
      effects: IrEffectsStyleSchema.optional(),
      // Zod 4 z.record(enum, …) requires every enum key; responsive overrides are sparse.
      responsive: z
        .partialRecord(IrResponsiveBreakpointSchema, IrStyleSchema)
        .optional(),
    })
    .strict(),
);
export type { IrStyle };

const SharedNodeFields = {
  id: z.string().min(1),
  style: IrStyleSchema.default({}),
  provenance: IrProvenanceSchema.default({ classNames: [] }),
  notes: z.array(z.string()).default([]),
};

export const IrContainerPropsSchema = z
  .object({
    as: z.string().optional(),
    role: z.string().optional(),
  })
  .strict();

export const IrHeadingPropsSchema = z
  .object({
    level: z.number().int().min(1).max(6),
    text: z.string(),
    html: z.string().optional(),
  })
  .strict();

export const IrTextPropsSchema = z
  .object({
    text: z.string(),
    html: z.string().optional(),
  })
  .strict();

export const IrImagePropsSchema = z
  .object({
    src: z.string().min(1),
    alt: z.string(),
    width: z.number().positive().optional(),
    height: z.number().positive().optional(),
    decorative: z.boolean().optional(),
  })
  .strict();

export const IrButtonPropsSchema = z
  .object({
    text: z.string(),
    href: z.string().optional(),
    type: z.enum(["button", "submit", "reset", "link"]).optional(),
    target: z.string().optional(),
    rel: z.string().optional(),
  })
  .strict();

export const IrLinkPropsSchema = z
  .object({
    text: z.string().optional(),
    href: z.string().min(1),
    target: z.string().optional(),
    rel: z.string().optional(),
  })
  .strict();

export const IrListPropsSchema = z
  .object({
    listType: z.enum(["ul", "ol"]),
  })
  .strict();

export const IrListItemPropsSchema = z
  .object({
    text: z.string().optional(),
  })
  .strict();

export const IrSpacerPropsSchema = z
  .object({
    axis: z.enum(["y", "x"]).default("y"),
    size: CssValue.optional(),
  })
  .strict();

export const IrDividerPropsSchema = z.object({}).strict();

export const IrIconPropsSchema = z
  .object({
    name: z.string().optional(),
    svg: z.string().optional(),
    src: z.string().optional(),
  })
  .strict();

export const IrHtmlEmbedPropsSchema = z
  .object({
    html: z.string(),
  })
  .strict();

export const IrGroupPropsSchema = z
  .object({
    as: z.string().optional(),
    role: z.string().optional(),
  })
  .strict();

export const IrUnsupportedPropsSchema = z
  .object({
    reasonCode: UnsupportedReasonCodeSchema,
    message: z.string().min(1),
    originalSummary: z.string().optional(),
  })
  .strict();

export type IrNode = {
  id: string;
  style?: IrStyle;
  provenance?: z.infer<typeof IrProvenanceSchema>;
  notes?: string[];
  children: IrNode[];
} & (
  | { kind: "container"; props: z.infer<typeof IrContainerPropsSchema> }
  | { kind: "heading"; props: z.infer<typeof IrHeadingPropsSchema> }
  | { kind: "text"; props: z.infer<typeof IrTextPropsSchema> }
  | { kind: "image"; props: z.infer<typeof IrImagePropsSchema> }
  | { kind: "button"; props: z.infer<typeof IrButtonPropsSchema> }
  | { kind: "link"; props: z.infer<typeof IrLinkPropsSchema> }
  | { kind: "list"; props: z.infer<typeof IrListPropsSchema> }
  | { kind: "list-item"; props: z.infer<typeof IrListItemPropsSchema> }
  | { kind: "spacer"; props: z.infer<typeof IrSpacerPropsSchema> }
  | { kind: "divider"; props: z.infer<typeof IrDividerPropsSchema> }
  | { kind: "icon"; props: z.infer<typeof IrIconPropsSchema> }
  | { kind: "html-embed"; props: z.infer<typeof IrHtmlEmbedPropsSchema> }
  | { kind: "group"; props: z.infer<typeof IrGroupPropsSchema> }
  | { kind: "unsupported"; props: z.infer<typeof IrUnsupportedPropsSchema> }
);

export const IrNodeSchema: z.ZodType<IrNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("container"),
        props: IrContainerPropsSchema.default({}),
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("heading"),
        props: IrHeadingPropsSchema,
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("text"),
        props: IrTextPropsSchema,
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("image"),
        props: IrImagePropsSchema,
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("button"),
        props: IrButtonPropsSchema,
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("link"),
        props: IrLinkPropsSchema,
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("list"),
        props: IrListPropsSchema,
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("list-item"),
        props: IrListItemPropsSchema.default({}),
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("spacer"),
        props: IrSpacerPropsSchema.default({ axis: "y" }),
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("divider"),
        props: IrDividerPropsSchema.default({}),
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("icon"),
        props: IrIconPropsSchema.default({}),
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("html-embed"),
        props: IrHtmlEmbedPropsSchema,
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("group"),
        props: IrGroupPropsSchema.default({}),
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
    z
      .object({
        ...SharedNodeFields,
        kind: z.literal("unsupported"),
        props: IrUnsupportedPropsSchema,
        children: z.array(IrNodeSchema).default([]),
      })
      .strict(),
  ]),
);

export const IrMetaSchema = z
  .object({
    sourceName: z.string().optional(),
    sourceLanguage: IrSourceLanguageSchema.default("unknown"),
    createdAt: z.string().datetime().optional(),
  })
  .strict();
export type IrMeta = z.infer<typeof IrMetaSchema>;

export const IrDocumentSchema = z
  .object({
    version: z.literal(IR_SCHEMA_VERSION),
    meta: IrMetaSchema.default({ sourceLanguage: "unknown" }),
    root: IrNodeSchema,
    diagnostics: z.array(IrDiagnosticSchema).default([]),
  })
  .strict();
export type IrDocument = z.infer<typeof IrDocumentSchema>;
