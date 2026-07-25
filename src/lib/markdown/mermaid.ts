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
    htmlLabels: false,
    flowchart: { useMaxWidth: true },
  });

  const id = `oghma-mermaid-${Date.now()}-${diagramSequence++}`;
  const { svg } = await mermaid.render(id, source);
  const preview = document.createElement("div");
  preview.className = "oghma-mermaid-diagram";
  preview.setAttribute("role", "img");
  preview.setAttribute("aria-label", "Mermaid diagram preview");
  preview.innerHTML = DOMPurify.sanitize(svg, {
    ADD_TAGS: ["foreignObject"],
    ADD_ATTR: ["xmlns"],
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  });
  preview
    .querySelectorAll<SVGForeignObjectElement>("foreignObject")
    .forEach((foreignObject) => {
      if (!foreignObject.closest("svg")) {
        foreignObject.remove();
        return;
      }
      foreignObject.querySelectorAll<HTMLElement>("*").forEach((label) => {
        label.style.setProperty("color", "#fff", "important");
      });
    });
  preview.querySelectorAll<SVGElement>("text, tspan").forEach((label) => {
    label.style.setProperty("color", "#fff", "important");
    label.style.setProperty("fill", "#fff", "important");
  });
  return preview;
}
