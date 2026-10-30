import { z } from "zod";

export const treeViewSettingsSchema = z.object({
  group: z.enum(["folders", "tags"]),
  /** folding only changes anything once a finished course exists, so it starts on */
  hideFinished: z.boolean(),
  marks: z.enum(["dots", "badge", "off"]),
  /** images, videos and other attachments. notes and PDFs always show */
  showFiles: z.boolean(),
  sort: z.enum(["name", "recent"]),
});
export type TreeViewSettings = z.infer<typeof treeViewSettingsSchema>;
export type TreeMarkStyle = TreeViewSettings["marks"];

export const DEFAULT_TREE_VIEW: TreeViewSettings = {
  group: "folders",
  hideFinished: true,
  marks: "dots",
  showFiles: true,
  sort: "name",
};

// stored settings can predate a key or come from an older build, so each key falls back on its own
const storedTreeViewSchema = z
  .object({
    group: treeViewSettingsSchema.shape.group.catch(DEFAULT_TREE_VIEW.group),
    hideFinished: treeViewSettingsSchema.shape.hideFinished.catch(DEFAULT_TREE_VIEW.hideFinished),
    marks: treeViewSettingsSchema.shape.marks.catch(DEFAULT_TREE_VIEW.marks),
    showFiles: treeViewSettingsSchema.shape.showFiles.catch(DEFAULT_TREE_VIEW.showFiles),
    sort: treeViewSettingsSchema.shape.sort.catch(DEFAULT_TREE_VIEW.sort),
  })
  .catch(DEFAULT_TREE_VIEW);

export function readTreeViewSettings(value: unknown): TreeViewSettings {
  return storedTreeViewSchema.parse(value);
}
