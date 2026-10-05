import {
  collectContextFiles,
  collectGenericObject,
  collectGenericPaginated,
  pathWithQuery,
  sanitizeZipPart,
} from "./raw-export-helpers";
import { collectGroupArchive } from "./raw-export-groups";
import type {
  CanvasRawExportArchive,
  RawExportClient,
  RawExportState,
} from "./raw-export-types";

async function collectAccountOverview(
  client: RawExportClient,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const objects = [
    ["/users/self/profile", "profile"],
    ["/users/self/settings", "settings"],
    ["/accounts/self/account_notifications", "account-notifications"],
    ["/users/self/upcoming_events", "upcoming-events"],
    ["/users/self/todo", "todo"],
  ] as const;
  for (const [path, name] of objects) {
    await collectGenericObject(
      client,
      path,
      `_account/${name}.json`,
      archive,
      state,
    );
  }
  await collectGenericPaginated(
    client,
    pathWithQuery("/users/self/activity_stream", {
      only_active_courses: false,
    }),
    "_account/activity-stream.json",
    archive,
    state,
  );
  await collectGenericObject(
    client,
    "/users/self/activity_stream/summary",
    "_account/activity-stream-summary.json",
    archive,
    state,
  );
  await collectGenericObject(
    client,
    "/users/self/communication_channels",
    "_account/communication-channels.json",
    archive,
    state,
  );
}

async function collectAccountResources(
  client: RawExportClient,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  await collectGenericPaginated(
    client,
    "/users/self/bookmarks",
    "_account/bookmarks.json",
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    "/comm_messages",
    "_account/communication-messages.json",
    archive,
    state,
  );
  await collectGenericObject(
    client,
    "/conferences",
    "_account/conferences.json",
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    "/users/self/content_exports",
    "_account/content-exports.json",
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    "/media_objects",
    "_account/media/media-objects.json",
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    "/media_attachments",
    "_account/media/media-attachments.json",
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    pathWithQuery("/calendar_events", { all_events: true }),
    "_account/calendar/calendar-events.json",
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    "/planner/items",
    "_account/planner/planner-items.json",
    archive,
    state,
  );
  await collectGenericObject(
    client,
    "/users/self/missing_submissions",
    "_account/missing-submissions.json",
    archive,
    state,
  );
}

async function collectConversations(
  client: RawExportClient,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  await collectGenericObject(
    client,
    "/conversations/unread_count",
    "_account/conversations/unread-count.json",
    archive,
    state,
  );
  const params = { include: ["participant_avatars"] };
  const lists = [
    [pathWithQuery("/conversations", params), "inbox"],
    ...["unread", "starred", "archived", "sent"].map((scope) => [
      pathWithQuery("/conversations", { ...params, scope }),
      scope,
    ]),
  ];
  const conversations = new Map<string, Record<string, unknown>>();
  for (const [path, name] of lists) {
    const items = await collectGenericPaginated(
      client,
      path,
      `_account/conversations/${name}.json`,
      archive,
      state,
    );
    for (const item of items) {
      if (item.id) conversations.set(String(item.id), item);
    }
  }
  for (const [id, summary] of conversations) {
    const title = sanitizeZipPart(
      summary.subject ?? summary.audience_context_name,
      `conversation-${id}`,
    );
    await collectGenericObject(
      client,
      pathWithQuery(`/conversations/${id}`, params),
      `_account/conversations/${title}.json`,
      archive,
      state,
    );
  }
}

async function collectAccountGroups(
  client: RawExportClient,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  const groups = [
    ...(await collectGenericPaginated(
      client,
      "/users/self/groups",
      "_account/groups/groups.json",
      archive,
      state,
    )),
    ...(await collectGenericPaginated(
      client,
      "/users/self/favorites/groups",
      "_account/groups/favorite-groups.json",
      archive,
      state,
    )),
  ];
  for (const group of groups)
    await collectGroupArchive(client, group, archive, state);
}

export async function collectAccountArchive(
  client: RawExportClient,
  archive: CanvasRawExportArchive,
  state: RawExportState,
) {
  await collectAccountOverview(client, archive, state);
  await collectAccountResources(client, archive, state);
  await collectContextFiles(
    client,
    "/users/self",
    "_account/user-files",
    archive,
    state,
  );
  await collectConversations(client, archive, state);
  await collectAccountGroups(client, archive, state);
}
