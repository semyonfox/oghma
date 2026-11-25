let themeFrame = 0;

export function applyColourTheme(theme: string | null | undefined) {
  const root = document.documentElement;
  const isDark = theme === "system" || !theme
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : theme === "dark";
  const next = isDark ? "dark" : "light";
  if (root.classList.contains(next)) return;

  window.cancelAnimationFrame(themeFrame);
  root.classList.add("theme-switching");
  root.classList.toggle("light", !isDark);
  root.classList.toggle("dark", isDark);
  // keep transitions off until the switched palette has painted
  themeFrame = window.requestAnimationFrame(() => {
    themeFrame = window.requestAnimationFrame(() => root.classList.remove("theme-switching"));
  });
}
