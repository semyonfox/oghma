import { cacheInvalidate, cacheKeys } from "@/lib/cache";

/**
 * Clear every cached view that can hide a newly durable tree item.
 *
 * Background import workers create notes outside the normal notes API, so
 * they must explicitly invalidate the same branch/list views after their
 * transaction commits. Keeping this in one helper makes that publication
 * boundary hard to miss in future workers.
 */
export async function invalidateTreeAfterPublish(
  userId: string,
  parentId: string | null | undefined,
): Promise<void> {
  await cacheInvalidate(
    cacheKeys.treeChildren(userId, parentId ?? null),
    cacheKeys.treeFull(userId),
    cacheKeys.notesList(userId, 0, undefined),
  );
}
