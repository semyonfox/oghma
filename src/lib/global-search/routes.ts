const GLOBAL_SEARCH_PATH_PREFIXES = [
  "/notes",
  "/chat",
  "/calendar",
  "/quiz",
  "/settings",
  "/study-map",
];

/**
 * Global search is available on the workspace surfaces where its destinations
 * and keyboard shortcut are meaningful. Keeping the rule here lets the small
 * root boundary avoid loading the modal on public pages. Every page that
 * renders the primary navigation must be listed, or its Search button opens
 * nothing.
 */
export function isGlobalSearchRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return GLOBAL_SEARCH_PATH_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`) ||
      pathname.startsWith(`${prefix}#`) ||
      pathname.startsWith(`${prefix}?`),
  );
}
