import type { CanvasRecord } from "./client";
import {
  addJsonEntry,
  collectContextFiles,
  collectGenericObject,
  collectGenericPaginated,
  sanitizeZipPart,
} from "./raw-export-helpers";
import type {
  CanvasRawExportArchive,
  RawExportClient,
  RawExportState,
} from "./raw-export-types";

async function collectGroupDiscussions(
  client: RawExportClient,
  groupId: unknown,
  groupPath: string,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const topics = await collectGenericPaginated(
    client,
    `/groups/${groupId}/discussion_topics`,
    `${groupPath}/discussions/discussions.json`,
    archive,
    state,
  );
  for (const topic of topics) {
    if (!topic.id) continue;
    const name = sanitizeZipPart(topic.title, `discussion-${topic.id}`);
    await collectGenericObject(
      client,
      `/groups/${groupId}/discussion_topics/${topic.id}`,
      `${groupPath}/discussions/${name}.json`,
      archive,
      state,
    );
    await collectGenericObject(
      client,
      `/groups/${groupId}/discussion_topics/${topic.id}/view`,
      `${groupPath}/discussions/${name}-view.json`,
      archive,
      state,
    );
    await collectGenericPaginated(
      client,
      `/groups/${groupId}/discussion_topics/${topic.id}/entries`,
      `${groupPath}/discussions/${name}-entries.json`,
      archive,
      state,
    );
  }
}

async function collectGroupExtras(
  client: RawExportClient,
  groupId: unknown,
  groupPath: string,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const paginated = [
    ["collaborations", "collaborations.json"],
    ["content_exports", "content-exports.json"],
    ["media_objects", "media/media-objects.json"],
    ["media_attachments", "media/media-attachments.json"],
  ] as const;
  await collectGenericPaginated(
    client,
    `/groups/${groupId}/${paginated[0][0]}`,
    `${groupPath}/${paginated[0][1]}`,
    archive,
    state,
  );
  await collectGenericObject(
    client,
    `/groups/${groupId}/conferences`,
    `${groupPath}/conferences.json`,
    archive,
    state,
  );
  for (const [apiPath, archivePath] of paginated.slice(1)) {
    await collectGenericPaginated(
      client,
      `/groups/${groupId}/${apiPath}`,
      `${groupPath}/${archivePath}`,
      archive,
      state,
    );
  }
}

export async function collectGroupArchive(
  client: RawExportClient,
  group: CanvasRecord,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const groupId = group.id;
  if (!groupId || state.seenGroupIds.has(String(groupId))) return;
  state.seenGroupIds.add(String(groupId));
  const groupPath = `_groups/${sanitizeZipPart(group.name, `group-${groupId}`)}`;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${groupPath}/group.json`,
    group,
  );
  await collectContextFiles(
    client,
    `/groups/${groupId}`,
    `${groupPath}/files`,
    archive,
    state,
  );
  await collectGroupDiscussions(client, groupId, groupPath, archive, state);
  await collectGroupExtras(client, groupId, groupPath, archive, state);
}
