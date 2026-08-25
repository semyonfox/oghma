const GLOBAL_SEARCH_PATH_PREFIXES = [
  "/notes",
  "/chat",
  "/calendar",
  "/quiz",
  "/settings",
];

/**
 * Global search is available on the workspace surfaces where its destinations
 * and keyboard shortcut are meaningful. Keeping the rule here lets the small
 * root boundary avoid loading the modal on public pages.
 */
export function isGlobalSearchRoute(pathname: string | null): boolean {
  return GLOBAL_SEARCH_PATH_PREFIXES.some((prefix) =>
    pathname?.startsWith(prefix),
  );
}
