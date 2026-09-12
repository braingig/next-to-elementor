/**
 * Root / global CSS source modules that are often skipped as visual pages
 * (TanStack `__root`, Next `app/layout`, Pages `_app`) but still import
 * project stylesheets.
 */

const ROOT_CSS_MODULE_RE =
  /(?:^|\/)(?:routes\/__root|app\/layout|pages\/_app)\.(tsx|ts|jsx|js)$/i;

/** Deterministic list of root layout modules present in the text VFS. */
export function listRootCssSourceModules(
  textFiles: Record<string, string>,
): string[] {
  return Object.keys(textFiles)
    .filter((path) => ROOT_CSS_MODULE_RE.test(path))
    .sort((a, b) => a.localeCompare(b));
}
