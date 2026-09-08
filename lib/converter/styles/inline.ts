import type { IrStyle } from "../ir/schema";
import { declarationsToIrStyle } from "./declarations";

/**
 * Parse a CSS-ish inline style string (`color:red;font-size:18px`) into IrStyle.
 */
export function resolveInlineStyleRaw(raw: string | undefined): {
  style: IrStyle;
  unresolved: string[];
} {
  if (!raw?.trim()) {
    return { style: {}, unresolved: [] };
  }
  const declarations: Record<string, string> = {};
  for (const part of raw.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx < 0) continue;
    const prop = trimmed.slice(0, idx).trim().toLowerCase();
    const value = trimmed.slice(idx + 1).trim();
    if (prop) declarations[prop] = value;
  }
  return declarationsToIrStyle(declarations);
}
