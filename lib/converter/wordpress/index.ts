/**
 * Target WordPress integration (configurable site — not a local Docker harness).
 *
 * Credentials: gitignored `.n2e-wp.local.json` only.
 * Media uploads reuse Phase 14c/14d `createWordPressMediaClient`.
 * Each import creates a new Elementor Library template (no target post ID).
 */

export {
  resolveWordPressTargetConfig,
  basicAuthHeader,
  wordpressRestUrl,
  WP_LOCAL_CONFIG_FILE_NAME,
  candidateConfigDirectories,
  type WordPressTargetConfig,
  type WordPressConfigSource,
  type ResolveWordPressConfigResult,
} from "./config";

export {
  applyMediaAttachmentIds,
} from "./apply-media-ids";

export {
  importElementorDocument,
  type ImportElementorDocumentOptions,
  type ImportElementorDocumentResult,
  type ImportElementorDocumentFailure,
} from "./import-document";
