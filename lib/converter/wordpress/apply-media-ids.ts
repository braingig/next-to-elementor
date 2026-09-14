/**
 * Apply WordPress Media Library attachment IDs onto Elementor document media
 * objects when the URL matches a successful upload/reuse result.
 */

import type { ElementorDocument, ElementorElement } from "../rules/native/types";
import type { ProjectMediaUploadResult } from "../project/media/types";

function buildUrlToAttachmentId(
  uploads: ProjectMediaUploadResult[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const u of uploads) {
    if (u.status !== "uploaded" && u.status !== "reused") continue;
    if (!u.url || !u.attachmentId) continue;
    const id = Number(u.attachmentId);
    if (!Number.isFinite(id) || id <= 0) continue;
    map.set(u.url, id);
  }
  return map;
}

function patchMediaObject(
  value: unknown,
  urlToId: Map<string, number>,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const url = typeof obj.url === "string" ? obj.url : null;
  if (!url) return value;
  const id = urlToId.get(url);
  if (id == null) return value;
  return {
    ...obj,
    id,
    source: "library",
  };
}

function walkElement(
  el: ElementorElement,
  urlToId: Map<string, number>,
): ElementorElement {
  const settings = { ...el.settings };
  if ("image" in settings) {
    settings.image = patchMediaObject(settings.image, urlToId);
  }
  if ("background_image" in settings) {
    settings.background_image = patchMediaObject(
      settings.background_image,
      urlToId,
    );
  }
  // Custom HTML may embed URLs as text; leave as-is (already target URLs after rewrite).
  return {
    ...el,
    settings,
    elements: (el.elements ?? []).map((child) => walkElement(child, urlToId)),
  };
}

/**
 * Returns a shallow-cloned document with Image / background media IDs filled in.
 */
export function applyMediaAttachmentIds(
  document: ElementorDocument,
  uploads: ProjectMediaUploadResult[],
): ElementorDocument {
  const urlToId = buildUrlToAttachmentId(uploads);
  if (urlToId.size === 0) return document;
  return {
    ...document,
    content: document.content.map((el) => walkElement(el, urlToId)),
  };
}
