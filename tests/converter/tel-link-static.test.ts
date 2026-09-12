/**
 * Cross-module static string consts (e.g. tel: href) resolve into IR links/buttons.
 */

import { describe, expect, it } from "vitest";
import {
  convertSource,
  type ElementorDocument,
  type ElementorElement,
} from "@/lib/converter";

function walk(els: ElementorElement[] | undefined, visit: (el: ElementorElement) => void) {
  for (const el of els ?? []) {
    visit(el);
    walk(el.elements, visit);
  }
}

describe("static primitive exports (tel: / phone text)", () => {
  it("preserves imported tel: href and phone label text", () => {
    const result = convertSource({
      source: `
        import { PHONE, PHONE_HREF } from "./brand";
        export default function HeroCta() {
          return (
            <a href={PHONE_HREF} className="rounded-full border px-6 py-3">
              Call {PHONE}
            </a>
          );
        }
      `,
      moduleSources: {
        "src/hero.tsx": "// entry mirrored for path resolution",
        "src/brand.tsx": `
          export const PHONE = "304-443-9283";
          export const PHONE_HREF = "tel:+13044439283";
        `,
      },
      sourcePath: "src/hero.tsx",
      catalogTarget: "4.2.4",
      title: "tel-cta",
    });
    const doc = result.elementorJson as ElementorDocument;
    let found: { url?: string; title?: string } | null = null;
    walk(doc.content, (el) => {
      if (el.widgetType !== "button" && el.widgetType !== "html") return;
      const link = el.settings?.link as { url?: string } | undefined;
      const title = String(el.settings?.title ?? el.settings?.text ?? "");
      const html = String(el.settings?.html ?? "");
      if (link?.url?.startsWith("tel:") || html.includes("tel:")) {
        found = {
          url: link?.url ?? (html.match(/href="(tel:[^"]+)"/)?.[1]),
          title: title || (html.includes("304-443-9283") ? "304-443-9283" : undefined),
        };
      }
    });
    expect(found).not.toBeNull();
    expect(found!.url).toBe("tel:+13044439283");
    expect(
      found!.title?.includes("304-443-9283") ||
        JSON.stringify(doc).includes("304-443-9283"),
    ).toBe(true);
  });

  it("resolves same-file const tel: href", () => {
    const result = convertSource({
      source: `
        const PHONE_HREF = "tel:+15551212";
        export default function Call() {
          return <a href={PHONE_HREF}>Call us</a>;
        }
      `,
      catalogTarget: "4.2.4",
      title: "tel-same-file",
    });
    const doc = result.elementorJson as ElementorDocument;
    let url: string | undefined;
    walk(doc.content, (el) => {
      const link = el.settings?.link as { url?: string } | undefined;
      if (link?.url?.startsWith("tel:")) url = link.url;
      const html = String(el.settings?.html ?? "");
      const m = html.match(/href="(tel:[^"]+)"/);
      if (m) url = m[1];
    });
    expect(url).toBe("tel:+15551212");
  });
});
