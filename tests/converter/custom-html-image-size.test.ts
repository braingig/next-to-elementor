/**
 * Custom-HTML image sizing from IR box.height (Tailwind h-*).
 */

import { describe, expect, it } from "vitest";
import { serializeIrNodeHtml } from "@/lib/converter/rules/custom/html";
import type { IrNode } from "@/lib/converter";

describe("custom HTML image sizing", () => {
  it("emits inline height and drops intrinsic width when style.box.height is set", () => {
    const node: IrNode = {
      id: "logo",
      kind: "image",
      status: "ok",
      props: {
        src: "https://example.com/logo.png",
        alt: "Logo",
        width: 750,
        height: 501,
      },
      style: { box: { height: "3rem" } },
      provenance: {
        htmlTag: "img",
        classNames: ["h-12", "w-auto"],
        attributes: {},
      },
      notes: [],
      children: [],
    };
    const html = serializeIrNodeHtml(node, "nte-fb-test");
    expect(html).toContain('style="height:3rem;width:auto"');
    expect(html).not.toContain('width="750"');
    expect(html).not.toContain('height="501"');
  });

  it("strips provenance width/height attrs when IR height is present", () => {
    const node: IrNode = {
      id: "logo2",
      kind: "image",
      status: "ok",
      props: {
        src: "https://example.com/logo.png",
        alt: "Logo",
        width: 750,
        height: 501,
      },
      style: { box: { height: "3.5rem" } },
      provenance: {
        htmlTag: "img",
        classNames: ["h-14"],
        attributes: { width: "750", height: "501" },
      },
      notes: [],
      children: [],
    };
    const html = serializeIrNodeHtml(node, "nte-fb-test");
    expect(html).toContain("height:3.5rem");
    expect(html).not.toMatch(/\bwidth="/);
    expect(html).not.toMatch(/\bheight="/);
  });
});
