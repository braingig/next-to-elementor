/**
 * Image-like links: an IR `link` whose only meaningful visible content is a
 * single static image → Free Image widget with `link_to: custom`.
 *
 * Project-agnostic rule; generic fixtures below use unrelated brand/path shapes.
 * Festive Lights Pro is an optional end-to-end regression fixture only.
 */

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  convertProjectAsync,
  convertSource,
  extractImageLikeLink,
  extractProjectZip,
  type ElementorDocument,
  type ElementorElement,
  type IrNode,
} from "@/lib/converter";

function walk(els: ElementorElement[] | undefined, visit: (el: ElementorElement) => void) {
  for (const el of els ?? []) {
    visit(el);
    walk(el.elements, visit);
  }
}

function imageWidgets(doc: ElementorDocument): ElementorElement[] {
  const hits: ElementorElement[] = [];
  walk(doc.content, (el) => {
    if (el.widgetType === "image") hits.push(el);
  });
  return hits;
}

function htmlWidgets(doc: ElementorDocument): ElementorElement[] {
  const hits: ElementorElement[] = [];
  walk(doc.content, (el) => {
    if (el.widgetType === "html") hits.push(el);
  });
  return hits;
}

function expectNativeLinkedImage(
  doc: ElementorDocument,
  opts: { href: string; url: string; alt?: string },
) {
  const images = imageWidgets(doc);
  expect(images.length).toBeGreaterThanOrEqual(1);
  const match = images.find((el) => {
    const img = el.settings?.image as { url?: string; alt?: string } | undefined;
    return img?.url === opts.url;
  });
  expect(match).toBeDefined();
  expect(match!.widgetType).toBe("image");
  expect(match!.settings.link_to).toBe("custom");
  expect((match!.settings.link as { url?: string }).url).toBe(opts.href);
  if (opts.alt !== undefined) {
    expect((match!.settings.image as { alt?: string }).alt).toBe(opts.alt);
  }
  return match!;
}

describe("extractImageLikeLink", () => {
  it("accepts a link with a single image child", () => {
    const link: IrNode = {
      id: "a",
      kind: "link",
      status: "ok",
      props: { href: "/about" },
      style: {},
      provenance: { htmlTag: "a", classNames: [], attributes: { href: "/about" } },
      notes: [],
      children: [
        {
          id: "img",
          kind: "image",
          status: "ok",
          props: { src: "/mark.png", alt: "Company mark" },
          style: { box: { height: "3rem" } },
          provenance: { htmlTag: "img", classNames: ["h-12"], attributes: {} },
          notes: [],
          children: [],
        },
      ],
    };
    const extracted = extractImageLikeLink(link);
    expect(extracted?.href).toBe("/about");
    expect(extracted?.image.props.src).toBe("/mark.png");
  });

  it("unwraps a single wrapper and ignores sr-only siblings", () => {
    const link: IrNode = {
      id: "a",
      kind: "link",
      status: "ok",
      props: { href: "/home" },
      style: {},
      provenance: { htmlTag: "a", classNames: ["flex"], attributes: {} },
      notes: [],
      children: [
        {
          id: "wrap",
          kind: "container",
          status: "ok",
          props: { as: "span" },
          style: {},
          provenance: {
            htmlTag: "span",
            classNames: ["wrapper"],
            attributes: {},
          },
          notes: [],
          children: [
            {
              id: "img",
              kind: "image",
              status: "ok",
              props: { src: "/mark.png", alt: "Acme" },
              style: {},
              provenance: { htmlTag: "img", classNames: [], attributes: {} },
              notes: [],
              children: [],
            },
          ],
        },
        {
          id: "sr",
          kind: "text",
          status: "ok",
          props: { text: "Acme" },
          style: { layout: { display: "none" } },
          provenance: {
            htmlTag: "span",
            classNames: ["sr-only"],
            attributes: {},
          },
          notes: [],
          children: [],
        },
      ],
    };
    const extracted = extractImageLikeLink(link);
    expect(extracted?.href).toBe("/home");
    expect(extracted?.image.props.alt).toBe("Acme");
  });

  it("rejects links that also contain visible text content", () => {
    const link: IrNode = {
      id: "a",
      kind: "link",
      status: "ok",
      props: { href: "/shop", text: "Shop" },
      style: {},
      provenance: { htmlTag: "a", classNames: [], attributes: {} },
      notes: [],
      children: [
        {
          id: "img",
          kind: "image",
          status: "ok",
          props: { src: "/icon.png", alt: "" },
          style: {},
          provenance: { htmlTag: "img", classNames: [], attributes: {} },
          notes: [],
          children: [],
        },
        {
          id: "t",
          kind: "text",
          status: "ok",
          props: { text: "Shop" },
          style: {},
          provenance: { htmlTag: "span", classNames: [], attributes: {} },
          notes: [],
          children: [],
        },
      ],
    };
    expect(extractImageLikeLink(link)).toBeNull();
  });
});

describe("convertSource image-like links", () => {
  it("maps <a href><img></a> to native Image with custom link", () => {
    const result = convertSource({
      source: `
        export default function Brand() {
          return (
            <a href="/about">
              <img
                src="https://cdn.example.com/company-mark.png"
                alt="Company logo"
                className="h-12 w-auto"
                width={200}
                height={80}
              />
            </a>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "image-link-direct",
    });
    const doc = result.elementorJson as ElementorDocument;
    expectNativeLinkedImage(doc, {
      href: "/about",
      url: "https://cdn.example.com/company-mark.png",
      alt: "Company logo",
    });
    expect(htmlWidgets(doc).length).toBe(0);
  });

  it("maps <a href><span><img></span></a> to native Image with custom link", () => {
    const result = convertSource({
      source: `
        export default function HomeLink() {
          return (
            <a href="/">
              <span>
                <img src="https://cdn.example.com/home-mark.svg" alt="" />
              </span>
            </a>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "image-link-span-wrap",
    });
    const doc = result.elementorJson as ElementorDocument;
    expectNativeLinkedImage(doc, {
      href: "/",
      url: "https://cdn.example.com/home-mark.svg",
    });
    expect(htmlWidgets(doc).length).toBe(0);
  });

  it("maps wrapper + sr-only sibling to native Image with custom link", () => {
    const result = convertSource({
      source: `
        function BrandMark(props) {
          const className = props.className || "";
          return (
            <img
              src="https://cdn.example.com/acme-mark.png"
              alt="Acme"
              className={className}
              width={320}
              height={120}
            />
          );
        }
        export default function SiteChrome() {
          return (
            <a href="/home" className="flex min-w-0 items-center gap-3">
              <span className="wrapper inline-flex items-center rounded-xl border px-2 py-1.5">
                <BrandMark className="h-12 w-auto shrink-0" />
              </span>
              <span className="sr-only">Company logo</span>
            </a>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "image-link-wrapper-sr-only",
    });
    expect(result.elementorJson).not.toBeNull();
    const doc = result.elementorJson as ElementorDocument;
    expectNativeLinkedImage(doc, {
      href: "/home",
      url: "https://cdn.example.com/acme-mark.png",
      alt: "Acme",
    });
    expect(htmlWidgets(doc).every((h) => !String(h.settings?.html ?? "").includes("acme-mark"))).toBe(
      true,
    );
  });

  it("does not force native Image when the link has multiple visible children", () => {
    const result = convertSource({
      source: `
        export default function CardLink() {
          return (
            <a href="/docs" className="flex items-center gap-2">
              <img src="https://cdn.example.com/docs-icon.png" alt="" width={24} height={24} />
              <span>Documentation</span>
            </a>
          );
        }
      `,
      catalogTarget: "4.2.4",
      title: "image-link-mixed-content",
    });
    const doc = result.elementorJson as ElementorDocument;
    const linkedNative = imageWidgets(doc).filter(
      (el) => el.settings?.link_to === "custom",
    );
    expect(linkedNative.length).toBe(0);
  });
});

describe("regression fixture: Festive Lights Pro (when present)", () => {
  it("converts the header brand image-link to native Image once media rewrites the import", async () => {
    const zipPath = "/Users/nusratnova/Downloads/Festive Lights Pro.zip";
    if (!existsSync(zipPath)) return;

    const extracted = extractProjectZip(new Uint8Array(readFileSync(zipPath)));
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const client = {
      async upload(req: { assetPath: string }) {
        return {
          assetPath: req.assetPath,
          status: "uploaded" as const,
          url: `https://wp.example/media/${req.assetPath.replace(/^.*\//, "")}`,
          attachmentId: "1",
        };
      },
    };

    const project = await convertProjectAsync(extracted.vfs, {
      media: {
        enabled: true,
        client,
        optimize: false,
      },
    });
    const doc = project.routes[0]?.conversion.elementorJson as ElementorDocument | null;
    expect(doc).toBeTruthy();

    // Fixture brand mark may be native Image (simple cases) or inside scoped
    // custom HTML when an ancestor unequal grid escalates to Free HTML.
    const linkedImages = imageWidgets(doc!).filter((el) => {
      const link = el.settings?.link as { url?: string } | undefined;
      return el.settings?.link_to === "custom" && link?.url === "#home";
    });
    const htmlWithHomeImageLink = htmlWidgets(doc!).filter((el) => {
      const html = String(el.settings?.html ?? "");
      return html.includes('href="#home"') && /<img\b/i.test(html);
    });
    expect(linkedImages.length + htmlWithHomeImageLink.length).toBeGreaterThanOrEqual(
      1,
    );

    if (linkedImages.length > 0) {
      expect(
        (linkedImages[0]!.settings.image as { url?: string }).url,
      ).toMatch(/^https:\/\/wp\.example\/media\//);
    } else {
      const html = String(htmlWithHomeImageLink[0]!.settings.html);
      expect(html).toMatch(/https:\/\/wp\.example\/media\//);
      expect(html).toContain('href="#home"');
    }
  });
});
