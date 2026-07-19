export const EDITOR_WIDTH_VALUES = ["small", "medium", "large", "full"] as const;

export type EditorSize = (typeof EDITOR_WIDTH_VALUES)[number];

export const DEFAULT_EDITOR_SIZE: EditorSize = "medium";

export const EDITOR_WIDTH_OPTIONS: Array<{
  value: EditorSize;
  label: string;
  detail: string;
}> = [
  { value: "small", label: "Small", detail: "58ch" },
  { value: "medium", label: "Medium", detail: "72ch" },
  { value: "large", label: "Large", detail: "88ch" },
  { value: "full", label: "Full", detail: "Full width" },
];

export const EDITOR_WIDTH_STYLES: Record<
  EditorSize,
  {
    sourceMaxWidth: string;
    previewMaxWidth: string;
  }
> = {
  small: {
    sourceMaxWidth: "58ch",
    previewMaxWidth: "40rem",
  },
  medium: {
    sourceMaxWidth: "72ch",
    previewMaxWidth: "48rem",
  },
  large: {
    sourceMaxWidth: "88ch",
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
