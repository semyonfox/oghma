import { foldFinishedCourses, isFinishedCourse } from "@/lib/notes/tree-topics";
import type { TreeViewSettings } from "@/lib/notes/tree-view-settings";
import type { NoteModel } from "@/lib/notes/types/note";
import { ROOT_ID, type TreeModel } from "@/lib/notes/types/tree";
import { inferFileType } from "@/lib/notes/utils/file-spec";

/** the top-level folder (or file) an item sits under, found by walking parent ids */
export function topLevelAncestor(tree: TreeModel, id: string | null): string | null {
  let current = id;
  for (let depth = 0; current && depth < 100; depth += 1) {
    const parentId = tree.items[current]?.data?.pid;
    if (!parentId || parentId === ROOT_ID) {
      return tree.items[ROOT_ID]?.children.includes(current) ? current : null;
    }
    current = parentId;
  }
  return null;
}

// "Images and files" covers what isn't a note or a PDF
function isLooseFile(data: NoteModel | undefined): boolean {
  if (!data || data.isFolder || data.bundle) return false;
  const type = inferFileType(data.title, data.mimeType, data.s3Key);
  return type === "image" || type === "video" || type === "attachment";
}

function updatedTime(data: NoteModel | undefined): number {
  const time = data?.updatedAt ? Date.parse(data.updatedAt) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

export interface TreeViewResult {
  tree: TreeModel;
  /** finished top-level folders folded into the footer row */
  hiddenFinished: string[];
  /** finished folders currently shown, so the footer can offer to hide them again */
  shownFinished: string[];
}

/** the Folders view as settings shape it: finished courses folded, loose files hidden, sort applied */
export function applyTreeView(
  tree: TreeModel,
  settings: TreeViewSettings,
  options: { revealFinished: boolean; activeId: string | null },
): TreeViewResult {
  const rootChildren = tree.items[ROOT_ID]?.children ?? [];
  const activeRoot = topLevelAncestor(tree, options.activeId);
  const { visible, hidden } = foldFinishedCourses(
    rootChildren,
    (id) => tree.items[id]?.data?.course,
    {
      hide: settings.hideFinished && !options.revealFinished,
      keepIds: activeRoot ? new Set([activeRoot]) : undefined,
    },
  );
  const shownFinished = visible.filter((id) => isFinishedCourse(tree.items[id]?.data?.course));

  const items: TreeModel["items"] = {};
  for (const [id, item] of Object.entries(tree.items)) {
    let children = id === ROOT_ID ? visible : item.children;
    if (!settings.showFiles) {
      children = children.filter((childId) => !isLooseFile(tree.items[childId]?.data));
    }
    if (settings.sort === "recent") {
      children = [...children].sort(
        (left, right) => updatedTime(tree.items[right]?.data) - updatedTime(tree.items[left]?.data),
      );
    }
    items[id] = children === item.children ? item : { ...item, children };
  }
  return { tree: { ...tree, items }, hiddenFinished: hidden, shownFinished };
}
