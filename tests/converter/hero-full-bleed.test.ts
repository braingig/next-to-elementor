/**
 * Hero full-bleed background image + overlay absorption.
 */

import { describe, expect, it } from "vitest";
import {
  convertSource,
  loadElementorFreeCatalog,
  resolveTailwindUtility,
  validateElementorDocument,
  type ElementorDocument,
  type ElementorElement,
} from "@/lib/converter";
import {
  isAbsolutelyInset,
  isFullBleedCoverImage,
  isFullBleedOverlayLayer,
  resolveOverlayColor,
  resolveOverlayPaint,
} from "@/lib/converter/rules/native/widgets/full-bleed-background";
import type { IrNode } from "@/lib/converter";

const catalog = loadElementorFreeCatalog("4.2.4");

function walk(els: ElementorElement[] | undefined, visit: (el: ElementorElement) => void) {
  for (const el of els ?? []) {
    visit(el);
    walk(el.elements, visit);
  }
}

describe("tailwind inset + gradient bg", () => {
  it("maps sr-only to display none", () => {
    expect(resolveTailwindUtility("sr-only")).toEqual({
      layout: { display: "none" },
    });
  });

  it("maps arbitrary leading and tracking", () => {
    expect(resolveTailwindUtility("leading-[1.05]")).toEqual({
      typography: { lineHeight: "1.05" },
    });
    expect(resolveTailwindUtility("tracking-[0.2em]")).toEqual({
      typography: { letterSpacing: "0.2em" },
    });
  });

  it("maps arbitrary gradient bg to background.image not color", () => {
    const style = resolveTailwindUtility(
      "bg-[linear-gradient(to_bottom,oklch(0.16_0.04_162/0.85),oklch(0.16_0.04_162/0.9))]",
    );
    expect(style?.background?.image).toMatch(/linear-gradient/i);
    expect(style?.background?.image).toContain("oklch(0.16 0.04 162/0.85)");
    expect(style?.background?.color).toBeUndefined();
  });
});

describe("full-bleed detection helpers", () => {
  it("detects Festive-like absolute cover image", () => {
    const node: IrNode = {
      id: "img",
      kind: "image",
      status: "ok",
      props: { src: "/hero.jpg", alt: "Hero" },
      style: {
        position: {
          position: "absolute",
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
        },
        box: { width: "100%", height: "100%" },
      },
      provenance: {
        htmlTag: "img",
        classNames: ["absolute", "inset-0", "h-full", "w-full", "object-cover"],
        attributes: {},
      },
      notes: [],
      children: [],
    };
    expect(isAbsolutelyInset(node)).toBe(true);
    expect(isFullBleedCoverImage(node)).toBe(true);
  });

  it("detects empty absolute gradient overlay", () => {
    const node: IrNode = {
      id: "ov",
      kind: "container",
      status: "ok",
      props: { as: "div" },
      style: {
        position: {
          position: "absolute",
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
        },
        background: {
          image:
            "linear-gradient(to bottom, oklch(0.16 0.04 162/0.85), oklch(0.16 0.04 162/0.9))",
        },
      },
      provenance: {
        htmlTag: "div",
        classNames: ["absolute", "inset-0"],
        attributes: {},
      },
      notes: [],
      children: [],
    };
    expect(isFullBleedOverlayLayer(node)).toBe(true);
    expect(resolveOverlayColor(node)).toMatch(/^#|^rgba?\(/);
  });

  it("averages gradient stop alphas into overlay opacity", () => {
    const node: IrNode = {
      id: "ov",
      kind: "container",
      status: "ok",
      props: { as: "div" },
      style: {
        position: {
          position: "absolute",
          top: "0px",
          right: "0px",
          bottom: "0px",
          left: "0px",
        },
        background: {
          image:
            "linear-gradient(to bottom, oklch(0.16 0.04 162/0.85), oklch(0.16 0.04 162/0.72)_45%, oklch(0.16 0.04 162/0.9))",
        },
      },
      provenance: {
        htmlTag: "div",
        classNames: ["absolute", "inset-0"],
        attributes: {},
      },
      notes: [],
      children: [],
    };
    const paint = resolveOverlayPaint(node);
    expect(paint).not.toBeNull();
    expect(paint!.color).toMatch(/^rgb\(/);
    // Mid-positioned stop (_45%) wins over average of all stops.
    expect(paint!.opacity).toBeCloseTo(0.72, 2);
  });
});

describe("convertSource hero full-bleed", () => {
  const source = `
    export default function Hero() {
      return (
        <section className="relative flex min-h-screen flex-col overflow-hidden">
          <img
            src="https://cdn.example.com/hero-home.jpg"
            alt="Decorated home"
            width={1920}
            height={1088}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,oklch(0.16_0.04_162/0.85),oklch(0.16_0.04_162/0.72)_45%,oklch(0.16_0.04_162/0.9))]" />
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-24">
            <h1 className="text-4xl text-white">Make Your Home Shine</h1>
            <p className="mt-4 text-lg text-white">Professional installation</p>
          </div>
        </section>
      );
    }
  `;

  it("absorbs cover image into container background_image and overlay into background_overlay", () => {
    const result = convertSource({
      source,
      catalogTarget: "4.2.4",
      title: "hero-full-bleed",
    });
    expect(result.outcome === "complete" || result.outcome === "partial").toBe(
      true,
    );
    const doc = result.elementorJson as ElementorDocument;
    expect(validateElementorDocument(doc, catalog).passed).toBe(true);

    let hero: ElementorElement | undefined;
    walk(doc.content, (el) => {
      if (
        el.elType === "container" &&
        el.settings?.background_image &&
        typeof el.settings.background_image === "object" &&
        (el.settings.background_image as { url?: string }).url?.includes(
          "hero-home.jpg",
        )
      ) {
        hero = el;
      }
    });
    expect(hero).toBeDefined();
    expect(hero!.settings.background_background).toBe("classic");
    expect(hero!.settings.background_size).toBe("cover");
    expect(hero!.settings.background_position).toBe("center center");
    expect(hero!.settings.background_repeat).toBe("no-repeat");
    expect(hero!.settings.background_overlay_background).toBe("classic");
    expect(typeof hero!.settings.background_overlay_color).toBe("string");
    expect(String(hero!.settings.background_overlay_color).length).toBeGreaterThan(
      0,
    );

    // Cover image must not remain as a sibling Image widget under the hero.
    const imageWidgets: ElementorElement[] = [];
    walk(hero!.elements, (el) => {
      if (el.widgetType === "image") imageWidgets.push(el);
    });
    expect(
      imageWidgets.some((el) =>
        JSON.stringify(el.settings).includes("hero-home.jpg"),
      ),
    ).toBe(false);

    // Content heading still present above the background.
    let hasHeading = false;
    walk(hero!.elements, (el) => {
      if (
        el.widgetType === "heading" &&
        String(el.settings?.title ?? "").includes("Shine")
      ) {
        hasHeading = true;
      }
    });
    expect(hasHeading).toBe(true);

    expect(
      result.report.diagnostics.some((d) =>
        d.message?.includes("Absorbed absolute cover image"),
      ) ||
        JSON.stringify(result.report).includes("Absorbed absolute cover image"),
    ).toBe(true);
  });

  it("does not absorb normal non-absolute images", () => {
    const result = convertSource({
      source: `
        export default function Page() {
          return (
            <section className="flex flex-col gap-4">
              <img src="https://cdn.example.com/photo.jpg" alt="Photo" className="w-full" />
              <h1>Title</h1>
            </section>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "normal-image",
    });
    const doc = result.elementorJson as ElementorDocument;
    let foundImage = false;
    let foundBg = false;
    walk(doc.content, (el) => {
      if (el.widgetType === "image") foundImage = true;
      if (
        el.settings?.background_image &&
        JSON.stringify(el.settings.background_image).includes("photo.jpg")
      ) {
        foundBg = true;
      }
    });
    expect(foundImage).toBe(true);
    expect(foundBg).toBe(false);
  });
});
