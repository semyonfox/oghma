import type { TagsViewCourse, TagsViewFile } from "@/lib/notes/tags-view";
import { editedTime } from "@/lib/notes/tree-view";
import type { TreeViewSettings } from "@/lib/notes/tree-view-settings";
import type { NoteModel } from "@/lib/notes/types/note";
import { ROOT_ID, type TreeItemModel, type TreeModel } from "@/lib/notes/types/tree";

/** the phone reads the shared tree setting: "name" is course order there */
export type OutlineOrder = TreeViewSettings["sort"];

const titleCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

// a PDF bundle is a folder on disk but reads as one document
const isFolderRow = (data: NoteModel | undefined) => !!data?.isFolder && !data.bundle;

/**
 * Course order: folders before files, canvas module folders in the order the
 * course lists them, and everything else by title so "Week 2" comes before
 * "Week 10". Modules go first because they are the course's own structure
 */
export function compareCourseOrder(left: TreeItemModel, right: TreeItemModel): number {
  const folders = Number(isFolderRow(right.data)) - Number(isFolderRow(left.data));
  if (folders) return folders;
  const leftPosition = left.data?.modulePosition;
  const rightPosition = right.data?.modulePosition;
  if (leftPosition !== undefined || rightPosition !== undefined) {
    if (leftPosition === undefined) return 1;
    if (rightPosition === undefined) return -1;
    if (leftPosition !== rightPosition) return leftPosition - rightPosition;
  }
  return (
    titleCollator.compare(left.data?.title ?? "", right.data?.title ?? "") ||
    left.id.localeCompare(right.id)
  );
}

/**
 * The newest edit in a branch. the server already carries edits up to each
 * folder, this also counts loaded children so a note edited on this device
 * lifts its folder before the next refresh
 */
export function branchRecency(tree: TreeModel, id: string, cache = new Map<string, number>()): number {
  const known = cache.get(id);
  if (known !== undefined) return known;
  cache.set(id, 0);
  const item = tree.items[id];
  let newest = editedTime(item?.data);
  for (const childId of item?.children ?? []) {
    newest = Math.max(newest, branchRecency(tree, childId, cache));
  }
  cache.set(id, newest);
  return newest;
}

/** the children of one outline level, as the Order control asks */
export function orderOutline(
  tree: TreeModel,
  ids: readonly string[],
  order: OutlineOrder,
  cache = new Map<string, number>(),
): TreeItemModel[] {
  const items = ids.flatMap((id) => {
    const item = tree.items[id];
    return item && id !== ROOT_ID ? [item] : [];
  });
  // recent is about what you touched, so folders and files mix there
  return items.sort((left, right) =>
    order === "recent"
      ? branchRecency(tree, right.id, cache) - branchRecency(tree, left.id, cache) ||
        compareCourseOrder(left, right)
      : compareCourseOrder(left, right),
  );
}

export interface TopicOutlineGroup {
  key: string;
  kind: "review" | "topic" | "untagged";
  name: string;
  /** colour slot for a study-map topic */
  topicIndex: number | null;
  files: TagsViewFile[];
}

const fileTime = (file: TagsViewFile) => {
  const time = file.editedAt ? Date.parse(file.editedAt) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
};
const byTitle = (left: TagsViewFile, right: TagsViewFile) =>
  titleCollator.compare(left.title, right.title) || left.id.localeCompare(right.id);
const byRecent = (left: TagsViewFile, right: TagsViewFile) =>
  fileTime(right) - fileTime(left) || byTitle(left, right);

/**
 * One course's files grouped under study-map topics, the way the desktop
 * Topics view groups them: To review first, then each topic in map order,
 * then what no topic holds. A file sits under every topic it belongs to
 */
export function topicOutline(course: TagsViewCourse, order: OutlineOrder): TopicOutlineGroup[] {
  const sortFiles = (files: readonly TagsViewFile[]) => [...files].sort(order === "recent" ? byRecent : byTitle);
  const topics: TopicOutlineGroup[] = course.topics
    .filter((topic) => topic.files.length > 0)
    .map((topic) => ({
      key: `topic:${topic.mapId}:${topic.topicId}`,
      kind: "topic",
      name: topic.name,
      topicIndex: topic.topicIndex,
      files: sortFiles(topic.files),
    }));
  if (order === "recent") {
    // stable, so topics with no edits keep their map order
    topics.sort((left, right) => fileTime(right.files[0]) - fileTime(left.files[0]));
  }
  return [
    ...(course.review.length
      ? [{ key: "review", kind: "review" as const, name: "", topicIndex: null, files: sortFiles(course.review) }]
      : []),
    ...topics,
    ...(course.untagged.length
      ? [{ key: "untagged", kind: "untagged" as const, name: "", topicIndex: null, files: sortFiles(course.untagged) }]
      : []),
  ];
}

/** "now", "12m", "4h", "Mon", then "12 Oct": enough to scan a recent list */
export function shortEditedLabel(
  time: number,
  now: number,
  locale: string | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  if (!time) return null;
  const minutes = Math.floor((now - time) / 60_000);
  if (minutes < 1) return t("now");
  if (minutes < 60) return t("{count}m", { count: minutes });
  if (minutes < 24 * 60) return t("{count}h", { count: Math.floor(minutes / 60) });
  const date = new Date(time);
  if (minutes < 6 * 24 * 60) return date.toLocaleDateString(locale, { weekday: "short" });
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}),
  });
}
