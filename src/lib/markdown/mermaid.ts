import DOMPurify from "dompurify";

let diagramSequence = 0;

export async function renderMermaidElement(source: string) {
  const { default: mermaid } = await import("mermaid");
  const dark = document.documentElement.classList.contains("dark");

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: dark ? "dark" : "default",
  });

  const id = `oghma-mermaid-${Date.now()}-${diagramSequence++}`;
  const { svg } = await mermaid.render(id, source);
  const preview = document.createElement("div");
  preview.className = "oghma-mermaid-diagram";
  preview.setAttribute("role", "img");
  preview.setAttribute("aria-label", "Mermaid diagram preview");
  preview.innerHTML = DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
  return preview;
}
