import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type ElementorSourceInventory = {
  version: string;
  root: string;
  freeWidgetNames: string[];
  containerElementName: string | null;
  controlIdsByWidget: Record<string, string[]>;
  breakpointKeysFromSource: string[];
  htmlWidgetControlIds: string[];
};

const MVP_WIDGETS = [
  "heading",
  "text-editor",
  "image",
  "button",
  "icon",
  "divider",
  "spacer",
  "html",
] as const;

/**
 * Extract `return 'widget-name';` from get_name() in a PHP widget/element file.
 */
export function extractGetName(phpSource: string): string | null {
  const match = phpSource.match(
    /function\s+get_name\s*\(\s*\)\s*\{[\s\S]*?return\s*'([^']+)'/,
  );
  return match?.[1] ?? null;
}

/**
 * Heuristic extraction of add_control( 'id' … ) control IDs from PHP.
 * STATIC only — not a full PHP parser.
 */
export function extractAddControlIds(phpSource: string): string[] {
  const ids = new Set<string>();
  for (const match of phpSource.matchAll(
    /->add_control\(\s*'([^']+)'/g,
  )) {
    ids.add(match[1]!);
  }
  for (const match of phpSource.matchAll(
    /->add_responsive_control\(\s*'([^']+)'/g,
  )) {
    ids.add(match[1]!);
  }
  return [...ids].sort();
}

export function buildElementorSourceInventory(
  root: string,
  version: string,
): ElementorSourceInventory {
  const widgetsDir = join(root, "includes", "widgets");
  const freeWidgetNames: string[] = [];
  const controlIdsByWidget: Record<string, string[]> = {};

  if (existsSync(widgetsDir)) {
    for (const file of readdirSync(widgetsDir).sort()) {
      if (!file.endsWith(".php")) continue;
      const php = readFileSync(join(widgetsDir, file), "utf8");
      const name = extractGetName(php);
      if (!name) continue;
      freeWidgetNames.push(name);
      if ((MVP_WIDGETS as readonly string[]).includes(name)) {
        controlIdsByWidget[name] = extractAddControlIds(php);
      }
    }
  }

  let containerElementName: string | null = null;
  const containerPhp = join(root, "includes", "elements", "container.php");
  if (existsSync(containerPhp)) {
    const php = readFileSync(containerPhp, "utf8");
    containerElementName = extractGetName(php);
    controlIdsByWidget.container = extractAddControlIds(php);
  }

  // Common-base globals often hold _padding/_margin etc.
  const commonBase = join(root, "includes", "widgets", "common-base.php");
  if (existsSync(commonBase)) {
    controlIdsByWidget["__common-base"] = extractAddControlIds(
      readFileSync(commonBase, "utf8"),
    );
  }

  const breakpointKeysFromSource: string[] = [];
  const bpManager = join(root, "core", "breakpoints", "manager.php");
  if (existsSync(bpManager)) {
    const php = readFileSync(bpManager, "utf8");
    for (const match of php.matchAll(
      /BREAKPOINT_KEY_([A-Z_]+)\s*=\s*'([^']+)'/g,
    )) {
      breakpointKeysFromSource.push(match[2]!);
    }
  }

  return {
    version,
    root,
    freeWidgetNames: [...new Set(freeWidgetNames)].sort(),
    containerElementName,
    controlIdsByWidget,
    breakpointKeysFromSource: [...new Set(breakpointKeysFromSource)].sort(),
    htmlWidgetControlIds: controlIdsByWidget.html ?? [],
  };
}

export { MVP_WIDGETS };
