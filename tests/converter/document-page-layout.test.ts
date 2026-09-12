/**
 * Project-level Elementor Free Full Width / Canvas document Page Layout.
 */

import { describe, expect, it } from "vitest";
import {
  applyDocumentPageLayout,
  convertProject,
  convertSource,
  createProjectVirtualFSFromTextFiles,
  documentHasFullBleedLandingEvidence,
  ELEMENTOR_FREE_PAGE_TEMPLATES,
  loadElementorFreeCatalog,
  resolveProjectPageTemplate,
  validateElementorDocument,
  type ElementorDocument,
  type ElementorElement,
} from "@/lib/converter";

const catalog = loadElementorFreeCatalog("4.2.4");

function baseDoc(
  content: ElementorElement[],
  settings?: ElementorDocument["settings"],
): ElementorDocument {
  return {
    version: "0.4",
    title: "test",
    type: "page",
    content,
    ...(settings ? { settings } : {}),
  };
}

function fullBleedHero(): ElementorElement {
  return {
    id: "hero001",
    elType: "container",
    settings: {
      content_width: "full",
      min_height: { unit: "vh", size: 100 },
      background_background: "classic",
      background_image: {
        url: "https://example.com/hero.jpg",
        id: "",
      },
      background_size: "cover",
    },
    elements: [
      {
        id: "inner01",
        elType: "container",
        settings: {
          content_width: "boxed",
          width: { unit: "rem", size: 80 },
        },
        elements: [],
      },
    ],
  };
}

describe("Elementor Free document Page Layout catalog", () => {
  it("loads verified Free 4.2.4 page templates including Full Width", () => {
    expect(catalog.documentSettings?.controlId).toBe("template");
    const ids = catalog.documentSettings?.templates.map((t) => t.id) ?? [];
    expect(ids).toEqual(
      expect.arrayContaining([
        "default",
        "elementor_canvas",
        "elementor_header_footer",
        "elementor_theme",
      ]),
    );
    const fullWidth = catalog.documentSettings?.templates.find(
      (t) => t.id === "elementor_header_footer",
    );
    expect(fullWidth?.label).toMatch(/Full Width/i);
    expect(ELEMENTOR_FREE_PAGE_TEMPLATES.fullWidth).toBe(
      "elementor_header_footer",
    );
  });

  it("accepts settings.template in validateElementorDocument", () => {
    const doc = applyDocumentPageLayout(
      baseDoc([fullBleedHero()]),
      ELEMENTOR_FREE_PAGE_TEMPLATES.fullWidth,
    );
    expect(doc.settings?.template).toBe("elementor_header_footer");
    expect(validateElementorDocument(doc, catalog).passed).toBe(true);
  });

  it("rejects unknown document settings.template", () => {
    const doc = baseDoc([fullBleedHero()], {
      template: "not_a_free_template",
    });
    const result = validateElementorDocument(doc, catalog);
    expect(result.passed).toBe(false);
    expect(result.violations.some((v) => v.id === "document.settings.template")).toBe(
      true,
    );
  });
});

describe("full-bleed landing evidence", () => {
  it("detects full content_width + viewport min-height", () => {
    expect(documentHasFullBleedLandingEvidence(baseDoc([fullBleedHero()]))).toBe(
      true,
    );
  });

  it("does not treat boxed-only pages as full-bleed landing", () => {
    const doc = baseDoc([
      {
        id: "box001",
        elType: "container",
        settings: {
          content_width: "boxed",
          width: { unit: "%", size: 100 },
        },
        elements: [],
      },
    ]);
    expect(documentHasFullBleedLandingEvidence(doc)).toBe(false);
  });

  it("does not treat full width alone without bg or vh as evidence", () => {
    const doc = baseDoc([
      {
        id: "wide01",
        elType: "container",
        settings: { content_width: "full" },
        elements: [],
      },
    ]);
    expect(documentHasFullBleedLandingEvidence(doc)).toBe(false);
  });
});

describe("resolveProjectPageTemplate", () => {
  it("auto prefers Full Width when evidence exists", () => {
    expect(
      resolveProjectPageTemplate("auto", baseDoc([fullBleedHero()])),
    ).toBe(ELEMENTOR_FREE_PAGE_TEMPLATES.fullWidth);
  });

  it("auto stays unset without evidence", () => {
    expect(
      resolveProjectPageTemplate(
        "auto",
        baseDoc([
          {
            id: "plain",
            elType: "container",
            settings: {},
            elements: [],
          },
        ]),
      ),
    ).toBeUndefined();
  });

  it("off never sets a template", () => {
    expect(
      resolveProjectPageTemplate("off", baseDoc([fullBleedHero()])),
    ).toBeUndefined();
  });

  it("canvas / full-width force regardless of evidence", () => {
    const plain = baseDoc([
      {
        id: "plain",
        elType: "container",
        settings: {},
        elements: [],
      },
    ]);
    expect(resolveProjectPageTemplate("canvas", plain)).toBe(
      ELEMENTOR_FREE_PAGE_TEMPLATES.canvas,
    );
    expect(resolveProjectPageTemplate("full-width", plain)).toBe(
      ELEMENTOR_FREE_PAGE_TEMPLATES.fullWidth,
    );
  });
});

describe("project convert applies Page Layout; convertSource does not", () => {
  const landingPage = `export default function Page() {
  return (
    <section className="relative flex min-h-screen w-full items-center">
      <img
        className="absolute inset-0 h-full w-full object-cover"
        src="/hero.jpg"
        alt="Hero"
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,#000000aa,#000000cc)]" />
      <div className="relative mx-auto max-w-3xl px-6">
        <h1 className="text-4xl">Festive Lights</h1>
      </div>
    </section>
  );
}
`;

  it("convertSource leaves document.settings unset", () => {
    const result = convertSource({
      source: landingPage,
      sourceName: "page",
      language: "tsx",
      catalogTarget: "4.2.4",
      title: "single",
    });
    expect(result.elementorJson).not.toBeNull();
    const doc = result.elementorJson as ElementorDocument;
    expect(doc.settings).toBeUndefined();
    expect(validateElementorDocument(doc, catalog).passed).toBe(true);
  });

  it("project auto applies elementor_header_footer for full-bleed landing", () => {
    const vfs = createProjectVirtualFSFromTextFiles({
      "package.json": JSON.stringify({ name: "landing", dependencies: { next: "15.0.0", react: "19.0.0" } }),
      "app/page.tsx": landingPage,
    });
    const project = convertProject(vfs);
    expect(project.routes.length).toBeGreaterThan(0);
    const doc = project.routes[0]!.conversion.elementorJson as ElementorDocument | null;
    expect(doc).not.toBeNull();
    expect(doc!.settings?.template).toBe("elementor_header_footer");
    expect(validateElementorDocument(doc!, catalog).passed).toBe(true);
    expect(
      project.diagnostics
        .concat(project.routes.flatMap((r) => r.diagnostics))
        .some((d) => d.code === "document-page-layout-applied"),
    ).toBe(true);
  });

  it("documentPageLayout: off skips template even with evidence", () => {
    const vfs = createProjectVirtualFSFromTextFiles({
      "package.json": JSON.stringify({ name: "landing", dependencies: { next: "15.0.0", react: "19.0.0" } }),
      "app/page.tsx": landingPage,
    });
    const project = convertProject(vfs, { documentPageLayout: "off" });
    const doc = project.routes[0]!.conversion.elementorJson as ElementorDocument | null;
    expect(doc).not.toBeNull();
    expect(doc!.settings?.template).toBeUndefined();
  });

  it("documentPageLayout: canvas forces canvas template", () => {
    const vfs = createProjectVirtualFSFromTextFiles({
      "package.json": JSON.stringify({ name: "plain", dependencies: { next: "15.0.0", react: "19.0.0" } }),
      "app/page.tsx": `export default function Page() {
  return <div className="p-8"><h1>Hello</h1></div>;
}
`,
    });
    const project = convertProject(vfs, { documentPageLayout: "canvas" });
    const doc = project.routes[0]!.conversion.elementorJson as ElementorDocument | null;
    expect(doc).not.toBeNull();
    expect(doc!.settings?.template).toBe("elementor_canvas");
  });
});
