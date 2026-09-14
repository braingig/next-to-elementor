/**
 * WordPress Elementor Library import (mocked; no live WP).
 *
 * Normal flow: each import creates a NEW elementor_library template.
 * No targetPostId in the workflow.
 */

import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  applyMediaAttachmentIds,
  importElementorDocument,
  resolveWordPressTargetConfig,
  type ElementorDocument,
} from "@/lib/converter";

const WP_CONFIG = {
  baseUrl: "http://wp.test",
  username: "admin",
  applicationPassword: "secret",
} as const;

function sampleDocument(overrides?: {
  title?: string;
  content?: ElementorDocument["content"];
}): ElementorDocument {
  return {
    version: "0.4",
    title: overrides?.title ?? "Doc",
    type: "page",
    settings: { template: "elementor_header_footer" },
    content: overrides?.content ?? [
      {
        id: "1",
        elType: "widget",
        widgetType: "heading",
        settings: { title: "Hi" },
        elements: [],
      },
    ],
  };
}

function mediaDocument(): ElementorDocument {
  return sampleDocument({
    content: [
      {
        id: "img1",
        elType: "widget",
        widgetType: "image",
        settings: {
          image: {
            url: "http://wp.test/wp-content/uploads/logo.png",
            id: 10,
            source: "library",
          },
          link_to: "custom",
          link: { url: "/home" },
        },
        elements: [],
      },
    ],
  });
}

describe("resolveWordPressTargetConfig", () => {
  it("reads gitignored local file and never requires a post id", () => {
    const dir = mkdtempSync(join(tmpdir(), "n2e-wp-cfg-"));
    try {
      writeFileSync(
        join(dir, ".n2e-wp.local.json"),
        JSON.stringify({
          baseUrl: "http://wp.test/",
          username: "admin",
          applicationPassword: "abcd efgh ijkl mnop",
          targetPostId: 999,
        }),
      );
      const resolved = resolveWordPressTargetConfig({ cwd: dir });
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      expect(resolved.source).toBe("local-file");
      expect(resolved.config.baseUrl).toBe("http://wp.test");
      expect(
        "targetPostId" in resolved
          ? (resolved as { targetPostId?: number }).targetPostId
          : undefined,
      ).toBeUndefined();
      expect("targetPostId" in resolved.config).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts explicit config override for tests/callers", () => {
    const dir = mkdtempSync(join(tmpdir(), "n2e-wp-cfg-"));
    try {
      writeFileSync(
        join(dir, ".n2e-wp.local.json"),
        JSON.stringify({
          baseUrl: "http://file.test",
          username: "file-user",
          applicationPassword: "file-pass",
        }),
      );
      const resolved = resolveWordPressTargetConfig({
        cwd: dir,
        explicit: {
          baseUrl: "http://explicit.test",
          username: "explicit-user",
          applicationPassword: "explicit-pass",
        },
      });
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      expect(resolved.source).toBe("explicit");
      expect(resolved.config.baseUrl).toBe("http://explicit.test");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails clearly when local file is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "n2e-wp-cfg-"));
    try {
      const resolved = resolveWordPressTargetConfig({ cwd: dir });
      expect(resolved.ok).toBe(false);
      if (resolved.ok) return;
      expect(resolved.message).toContain(".n2e-wp.local.json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("finds .n2e-wp.local.json in a parent directory (restart-safe cwd)", () => {
    const root = mkdtempSync(join(tmpdir(), "n2e-wp-root-"));
    const nested = join(root, "apps", "web", ".next");
    try {
      mkdirSync(nested, { recursive: true });
      writeFileSync(
        join(root, ".n2e-wp.local.json"),
        JSON.stringify({
          baseUrl: "http://wp.test",
          username: "admin",
          applicationPassword: "abcd efgh ijkl mnop",
        }),
      );
      const resolved = resolveWordPressTargetConfig({
        cwd: nested,
      });
      expect(resolved.ok).toBe(true);
      if (!resolved.ok) return;
      expect(resolved.source).toBe("local-file");
      expect(resolved.path?.endsWith("/.n2e-wp.local.json")).toBe(true);
      expect(resolved.path).toContain("n2e-wp-root-");
      expect(resolved.config.baseUrl).toBe("http://wp.test");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("applyMediaAttachmentIds", () => {
  it("fills image.id and background_image.id from upload map", () => {
    const doc: ElementorDocument = {
      version: "0.4",
      title: "t",
      type: "page",
      content: [
        {
          id: "a",
          elType: "widget",
          widgetType: "image",
          settings: {
            image: {
              url: "http://wp.test/wp-content/uploads/mark.png",
              id: "",
              alt: "Mark",
              source: "url",
            },
          },
          elements: [],
        },
        {
          id: "b",
          elType: "container",
          settings: {
            background_image: {
              url: "http://wp.test/wp-content/uploads/hero.jpg",
              id: "",
              source: "url",
            },
          },
          elements: [],
        },
      ],
    };
    const out = applyMediaAttachmentIds(doc, [
      {
        assetPath: "src/assets/mark.png",
        status: "uploaded",
        url: "http://wp.test/wp-content/uploads/mark.png",
        attachmentId: "42",
      },
      {
        assetPath: "src/assets/hero.jpg",
        status: "reused",
        url: "http://wp.test/wp-content/uploads/hero.jpg",
        attachmentId: "99",
      },
    ]);
    const img = out.content[0]!.settings.image as {
      id: number;
      source: string;
      url: string;
    };
    expect(img.id).toBe(42);
    expect(img.source).toBe("library");
    expect(img.url).toBe("http://wp.test/wp-content/uploads/mark.png");
    expect(out.content[0]!.widgetType).toBe("image");
  });
});

describe("importElementorDocument", () => {
  it("creates a new elementor_library template without requiring a targetPostId", async () => {
    const calls: Array<{ url: string; method?: string; body: unknown }> = [];
    const doc = sampleDocument();
    const expectedData = JSON.stringify(doc.content);

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url, method: init?.method, body });
      if (
        url.endsWith("/wp/v2/elementor_library") &&
        init?.method === "POST"
      ) {
        return new Response(
          JSON.stringify({
            id: 201,
            link: "http://wp.test/?elementor_library=n2e",
            title: { rendered: "N2E Import" },
            type: "elementor_library",
            meta: {
              _elementor_edit_mode: "builder",
              _elementor_template_type: "page",
              _elementor_data: expectedData,
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const result = await importElementorDocument({
      config: WP_CONFIG,
      document: doc,
      title: "N2E Import",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mode).toBe("created");
    expect(result.postId).toBe(201);
    expect(result.postType).toBe("elementor_library");
    expect(result.editUrl).toBe(
      "http://wp.test/wp-admin/post.php?post=201&action=elementor",
    );
    expect(result.editUrl).toContain(`post=${result.postId}`);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      "http://wp.test/wp-json/wp/v2/elementor_library",
    );
    expect(calls[0]!.method).toBe("POST");
    const body = calls[0]!.body as {
      title: string;
      status: string;
      meta: Record<string, unknown>;
    };
    expect(body.title).toBe("N2E Import");
    expect(body.status).toBe("publish");
    expect(body.meta._elementor_edit_mode).toBe("builder");
    expect(body.meta._elementor_template_type).toBe("page");
    expect(body.meta._elementor_data).toBe(expectedData);
    expect(JSON.parse(String(body.meta._elementor_data))).toEqual(doc.content);
  });

  it("stores media-enabled image widgets exactly in _elementor_data", async () => {
    const doc = mediaDocument();
    const expectedData = JSON.stringify(doc.content);
    let postedMeta: Record<string, unknown> | null = null;

    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      postedMeta = body?.meta ?? null;
      return new Response(
        JSON.stringify({
          id: 301,
          link: "http://wp.test/?elementor_library=media",
          title: { rendered: "Media Doc" },
          type: "elementor_library",
          meta: body.meta,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await importElementorDocument({
      config: WP_CONFIG,
      document: doc,
      title: "Media Doc",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(postedMeta!._elementor_data).toBe(expectedData);
    const parsed = JSON.parse(String(postedMeta!._elementor_data)) as Array<{
      widgetType: string;
      settings: { image: { url: string; id: number } };
    }>;
    expect(parsed[0]!.widgetType).toBe("image");
    expect(parsed[0]!.settings.image.url).toBe(
      "http://wp.test/wp-content/uploads/logo.png",
    );
    expect(parsed[0]!.settings.image.id).toBe(10);
    expect(result.editUrl).toContain("post=301");
  });

  it("two consecutive imports create independent templates with different IDs and JSON", async () => {
    let nextId = 400;
    const created: Array<{ id: number; data: string }> = [];

    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      const id = nextId++;
      const data = String(body.meta._elementor_data);
      created.push({ id, data });
      return new Response(
        JSON.stringify({
          id,
          link: `http://wp.test/?p=${id}`,
          title: { rendered: body.title },
          type: "elementor_library",
          meta: body.meta,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const docA = sampleDocument({
      content: [
        {
          id: "a",
          elType: "widget",
          widgetType: "heading",
          settings: { title: "JSON A" },
          elements: [],
        },
      ],
    });
    const docB = sampleDocument({
      content: [
        {
          id: "b",
          elType: "widget",
          widgetType: "heading",
          settings: { title: "JSON B" },
          elements: [],
        },
      ],
    });

    const a = await importElementorDocument({
      config: WP_CONFIG,
      document: docA,
      title: "Import A",
      fetchImpl,
    });
    const b = await importElementorDocument({
      config: WP_CONFIG,
      document: docB,
      title: "Import B",
      fetchImpl,
    });

    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.postId).not.toBe(b.postId);
    expect(a.editUrl).not.toBe(b.editUrl);
    expect(a.editUrl).toContain(`post=${a.postId}`);
    expect(b.editUrl).toContain(`post=${b.postId}`);
    expect(created).toHaveLength(2);
    expect(JSON.parse(created[0]!.data)[0].settings.title).toBe("JSON A");
    expect(JSON.parse(created[1]!.data)[0].settings.title).toBe("JSON B");
    // Identity chain: edit URL document ID === created post ID (same as stored).
    expect(a.postId).toBe(created[0]!.id);
    expect(b.postId).toBe(created[1]!.id);
  });

  it("never POSTs to /wp/v2/pages and never uses a fixed target id", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      urls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response(
        JSON.stringify({
          id: 500,
          link: "http://wp.test/?p=500",
          title: { rendered: "T" },
          type: "elementor_library",
          meta: {
            _elementor_data: JSON.stringify(sampleDocument().content),
            _elementor_edit_mode: "builder",
            _elementor_template_type: "page",
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    await importElementorDocument({
      config: WP_CONFIG,
      document: sampleDocument(),
      fetchImpl,
    });

    expect(urls.some((u) => u.includes("/wp/v2/pages"))).toBe(false);
    expect(urls).toEqual([
      "POST http://wp.test/wp-json/wp/v2/elementor_library",
    ]);
  });

  it("edit URL document ID matches the newly created library template ID", async () => {
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      return new Response(
        JSON.stringify({
          id: 777,
          type: "elementor_library",
          title: { rendered: "Same Doc" },
          link: "http://wp.test/?p=777",
          meta: body.meta,
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await importElementorDocument({
      config: WP_CONFIG,
      document: sampleDocument(),
      title: "Same Doc",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Elementor editor loads post.php?post={id}&action=elementor → same id.
    expect(result.editUrl).toMatch(/post=777&action=elementor$/);
    expect(result.postId).toBe(777);
    expect(result.postType).toBe("elementor_library");
  });

  it("rejects response when stored _elementor_data does not match imported JSON", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          id: 1,
          title: { rendered: "x" },
          type: "elementor_library",
          meta: {
            _elementor_data: JSON.stringify([
              {
                id: "stale",
                elType: "widget",
                widgetType: "heading",
                settings: { title: "OLD" },
                elements: [],
              },
            ]),
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );

    const result = await importElementorDocument({
      config: WP_CONFIG,
      document: sampleDocument({
        content: [
          {
            id: "new",
            elType: "widget",
            widgetType: "heading",
            settings: { title: "NEW" },
            elements: [],
          },
        ],
      }),
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("wp-import-data-mismatch");
  });

  it("a brand-new template has no autosave dependency (single create POST only)", async () => {
    const methods: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      methods.push(`${init?.method ?? "GET"} ${String(input)}`);
      return new Response(
        JSON.stringify({
          id: 88,
          title: { rendered: "Fresh" },
          type: "elementor_library",
          meta: {
            _elementor_data: JSON.stringify(sampleDocument().content),
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await importElementorDocument({
      config: WP_CONFIG,
      document: sampleDocument(),
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(methods).toEqual([
      "POST http://wp.test/wp-json/wp/v2/elementor_library",
    ]);
    expect(methods.some((m) => m.includes("autosave") || m.includes("revision"))).toBe(
      false,
    );
  });
});
