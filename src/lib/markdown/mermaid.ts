import DOMPurify from "dompurify";

let diagramSequence = 0;

// Atlas palette for diagrams, read from the live theme tokens so diagrams
// follow light and dark mode. Fallbacks are the dark-theme values.
function atlasDiagramColours() {
  const style = getComputedStyle(document.documentElement);
  const raw = (name: string) => style.getPropertyValue(name).trim();
  // mermaid derives shades with khroma, which only parses hex/rgb/hsl, so the
  // oklch and translucent Atlas tokens are flattened onto the surface first
  const surface = toOpaqueHex(raw("--color-surface"), "#000000") ?? "#16171a";
  const token = (name: string, fallback: string) =>
    toOpaqueHex(raw(name), surface) ?? fallback;
  return {
    text: token("--color-text", "#ececee"),
    muted: token("--color-text-tertiary", "#a3a5ac"),
    surface,
    elevated: token("--color-surface-elevated", "#1c1d21"),
    border: token("--color-border-strong", "#3a3d43"),
    accentSoft: token("--color-accent-soft", "#24262b"),
    font: raw("--font-sans") || "ui-sans-serif, system-ui, sans-serif",
  };
}

let swatch: CanvasRenderingContext2D | null | undefined;

function toOpaqueHex(colour: string, backdrop: string) {
  if (!colour) return null;
  if (/^#[0-9a-f]{6}$/i.test(colour)) return colour;
  swatch ??= document
    .createElement("canvas")
    .getContext("2d", { willReadFrequently: true });
  if (!swatch) return null;
  swatch.fillStyle = backdrop;
  swatch.fillRect(0, 0, 1, 1);
  swatch.fillStyle = colour;
  swatch.fillRect(0, 0, 1, 1);
  const [r, g, b] = swatch.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export async function renderMermaidElement(source: string) {
  const { default: mermaid } = await import("mermaid");
  const dark = document.documentElement.classList.contains("dark");
  const colours = atlasDiagramColours();

  mermaid.initialize({
    startOnLoad: false,
    layout: "dagre",
    look: "classic",
    securityLevel: "strict",
    suppressErrorRendering: true,
    theme: "base",
    darkMode: dark,
    themeVariables: {
      background: colours.surface,
      primaryColor: colours.elevated,
      primaryTextColor: colours.text,
      primaryBorderColor: colours.border,
      secondaryColor: colours.accentSoft,
      tertiaryColor: colours.surface,
      lineColor: colours.muted,
      textColor: colours.text,
      fontFamily: colours.font,
    },
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
  const renderedSvg = preview.querySelector<SVGSVGElement>("svg");
  const viewBoxWidth = Number(renderedSvg?.getAttribute("viewBox")?.trim().split(/\s+/)[2]);
  if (Number.isFinite(viewBoxWidth) && viewBoxWidth > 0) {
    preview.style.setProperty(
      "--oghma-mermaid-intrinsic-width",
      `${viewBoxWidth}px`,
    );
  }
  preview
    .querySelectorAll<SVGForeignObjectElement>("foreignObject")
    .forEach((foreignObject) => {
      if (!foreignObject.closest("svg")) {
        foreignObject.remove();
        return;
      }
      foreignObject.querySelectorAll<HTMLElement>("*").forEach((label) => {
        label.style.setProperty("color", colours.text, "important");
      });
    });
  preview.querySelectorAll<SVGElement>("text, tspan").forEach((label) => {
    label.style.setProperty("color", colours.text, "important");
    label.style.setProperty("fill", colours.text, "important");
  });
  return preview;
}
