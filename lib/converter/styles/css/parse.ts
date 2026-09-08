import postcss, { type AtRule, type Declaration, type Rule } from "postcss";

export type CssRuleRecord = {
  selectors: string[];
  declarations: Record<string, string>;
  /** Cascade order (source order). */
  order: number;
  /** Simple specificity: (ids, classes, types) */
  specificity: [number, number, number];
  /** Media query breakpoint key when inside @media, else undefined (base). */
  mediaBreakpoint?: string;
  /** True when selector contains unsupported pseudo/feature for MVP apply. */
  skippedReason?: string;
};

export type ParsedCss = {
  rules: CssRuleRecord[];
  customProperties: Record<string, string>;
  diagnostics: Array<{ code: string; message: string }>;
};

/** Extract class identifiers referenced by selectors in parsed CSS. */
export function collectCssClassNames(parsed: ParsedCss): Set<string> {
  const classes = new Set<string>();
  for (const rule of parsed.rules) {
    for (const selector of rule.selectors) {
      for (const match of selector.matchAll(
        /\.([A-Za-z_][\w-]*)/g,
      )) {
        classes.add(match[1]!);
      }
    }
  }
  return classes;
}

const MEDIA_BP: Array<{ test: RegExp; bp: string }> = [
  { test: /\(max-width:\s*639px\)/i, bp: "sm" },
  { test: /\(max-width:\s*767px\)/i, bp: "sm" },
  { test: /\(max-width:\s*1023px\)/i, bp: "md" },
  { test: /\(min-width:\s*640px\)/i, bp: "sm" },
  { test: /\(min-width:\s*768px\)/i, bp: "md" },
  { test: /\(min-width:\s*1024px\)/i, bp: "lg" },
  { test: /\(min-width:\s*1280px\)/i, bp: "xl" },
  { test: /\(min-width:\s*1536px\)/i, bp: "2xl" },
];

function mediaToBreakpoint(params: string): string | undefined {
  for (const entry of MEDIA_BP) {
    if (entry.test.test(params)) {
      return entry.bp;
    }
  }
  return undefined;
}

function specificityOf(selector: string): [number, number, number] {
  const cleaned = selector.replace(/::?[a-z0-9_-]+(?:\([^)]*\))?/gi, "");
  const ids = (cleaned.match(/#[a-zA-Z0-9_-]+/g) ?? []).length;
  const classes =
    (cleaned.match(/\.[a-zA-Z0-9_-]+/g) ?? []).length +
    (cleaned.match(/\[[^\]]+\]/g) ?? []).length;
  const types = (cleaned.match(/(^|[\s>+~])([a-z][a-z0-9_-]*)/gi) ?? []).length;
  return [ids, classes, types];
}

function selectorSkipReason(selector: string): string | undefined {
  if (/::?(hover|focus|active|visited|focus-visible|focus-within)/i.test(selector)) {
    return "pseudo-state-not-applied";
  }
  if (/::?(before|after|placeholder|selection)/i.test(selector)) {
    return "pseudo-element-not-applied";
  }
  if (/:(has|is|where|not)\(/i.test(selector)) {
    return "complex-pseudo-not-applied";
  }
  if (/\[.*[\*\^\$\|~]=/.test(selector)) {
    // attribute operators other than exact are limited; still allow [attr=value]
  }
  return undefined;
}

function collectDecls(rule: Rule): Record<string, string> {
  const decls: Record<string, string> = {};
  rule.walkDecls((decl: Declaration) => {
    decls[decl.prop] = decl.value;
  });
  return decls;
}

/**
 * Parse CSS with PostCSS into flat rule records.
 * Not a full browser engine — unsupported constructs become diagnostics.
 */
export function parseCssSources(sources: string[]): ParsedCss {
  const rules: CssRuleRecord[] = [];
  const customProperties: Record<string, string> = {};
  const diagnostics: Array<{ code: string; message: string }> = [];
  let order = 0;

  for (const source of sources) {
    if (!source.trim()) continue;
    let root;
    try {
      root = postcss.parse(source);
    } catch (error) {
      diagnostics.push({
        code: "unknown-css",
        message: `Failed to parse CSS: ${(error as Error).message}`,
      });
      continue;
    }

    const visit = (nodes: typeof root.nodes, mediaBreakpoint?: string) => {
      for (const node of nodes ?? []) {
        if (node.type === "rule") {
          const rule = node as Rule;
          const decls = collectDecls(rule);
          for (const [k, v] of Object.entries(decls)) {
            if (k.startsWith("--")) {
              customProperties[k] = v;
            }
          }
          const selectors = rule.selectors.map((s) => s.trim()).filter(Boolean);
          for (const selector of selectors) {
            const skippedReason = selectorSkipReason(selector);
            rules.push({
              selectors: [selector],
              declarations: { ...decls },
              order: order++,
              specificity: specificityOf(selector),
              mediaBreakpoint,
              skippedReason,
            });
            if (skippedReason) {
              diagnostics.push({
                code: "unsupported-css",
                message: `Selector not applied (${skippedReason}): ${selector}`,
              });
            }
          }
        } else if (node.type === "atrule") {
          const at = node as AtRule;
          if (at.name === "media") {
            const bp = mediaToBreakpoint(at.params);
            if (!bp) {
              diagnostics.push({
                code: "responsive-unsupported",
                message: `Media query not mapped to an IR breakpoint: @media ${at.params}`,
              });
              // Still visit nested rules as base? Safer: skip applying.
              continue;
            }
            visit(at.nodes ?? [], bp);
          } else if (at.name === "supports" || at.name === "layer" || at.name === "container") {
            diagnostics.push({
              code: "unsupported-css",
              message: `@${at.name} rules are not applied in MVP style resolution.`,
            });
          }
        }
      }
    };

    visit(root.nodes);
  }

  return { rules, customProperties, diagnostics };
}

/** Resolve var(--x) when custom properties are known; otherwise leave intact. */
export function resolveCssVars(
  value: string,
  customProperties: Record<string, string>,
  depth = 0,
): { value: string; unresolved: boolean } {
  if (depth > 5) {
    return { value, unresolved: true };
  }
  let unresolved = false;
  const next = value.replace(/var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^)]+))?\)/g, (_, name, fallback) => {
    if (customProperties[name] != null) {
      const nested = resolveCssVars(customProperties[name], customProperties, depth + 1);
      unresolved = unresolved || nested.unresolved;
      return nested.value;
    }
    if (fallback != null) {
      return String(fallback).trim();
    }
    unresolved = true;
    return `var(${name})`;
  });
  return { value: next, unresolved };
}
