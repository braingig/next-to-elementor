import type { IrDocument } from "./ir/schema";
import {
  loadElementorFreeCatalog,
  type ElementorFreeCatalog,
  type SupportedElementorFreeTarget,
} from "./catalog";
import { convertToElementor } from "./rules/custom";
import {
  buildConversionResult,
  type ConversionResult,
} from "./report";

export type ConvertOptions = {
  catalog?: ElementorFreeCatalog;
  catalogTarget?: SupportedElementorFreeTarget;
  title?: string;
};

/**
 * High-level Phase 7 conversion: Elementor JSON + structured report.
 *
 * Decision order per node: native → custom → unsupported.
 * Lower-level APIs (`convertToNativeElementor`, `convertToElementor`) remain available.
 */
export function convert(
  ir: IrDocument,
  options: ConvertOptions = {},
): ConversionResult {
  const catalog =
    options.catalog ??
    loadElementorFreeCatalog(options.catalogTarget ?? "4.2.4");

  const conversion = convertToElementor(ir, {
    catalog,
    title: options.title,
  });

  return buildConversionResult({
    ir,
    conversion,
    catalog,
  });
}
