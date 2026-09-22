export const EDITOR_WIDTH_VALUES = ["large", "full"] as const;

export type EditorSize = (typeof EDITOR_WIDTH_VALUES)[number];

export const DEFAULT_EDITOR_SIZE: EditorSize = "large";

export const EDITOR_WIDTH_OPTIONS: Array<{
  value: EditorSize;
  label: string;
  detail: string;
}> = [
  { value: "large", label: "Large", detail: "62rem" },
  { value: "full", label: "Full", detail: "Full width" },
];

export const EDITOR_WIDTH_STYLES: Record<
  EditorSize,
  {
    sourceMaxWidth: string;
    previewMaxWidth: string;
  }
> = {
  large: {
    sourceMaxWidth: "62rem",
    previewMaxWidth: "62rem",
  },
  full: {
    sourceMaxWidth: "none",
    previewMaxWidth: "none",
  },
};

export function normalizeEditorSize(value: unknown): EditorSize {
  return EDITOR_WIDTH_VALUES.includes(value as EditorSize)
    ? (value as EditorSize)
    : DEFAULT_EDITOR_SIZE;
}

export function getEditorWidthStyle(value: unknown) {
  return EDITOR_WIDTH_STYLES[normalizeEditorSize(value)];
}

export function getEditorWidthIndex(value: unknown) {
  return EDITOR_WIDTH_VALUES.indexOf(normalizeEditorSize(value));
}

export function getEditorSizeFromIndex(value: unknown): EditorSize {
  const index = typeof value === "number" ? value : Number(value);
  return EDITOR_WIDTH_VALUES[index] ?? DEFAULT_EDITOR_SIZE;
}
