import { Zip, ZipDeflate } from "fflate";

const SUBMISSION_INCLUDES = [
  "submission_comments",
  "rubric_assessment",
  "submission_history",
  "attachments",
  "assignment",
];

function cleanCourseName(courseCode, courseName, term) {
  const codeMatch = courseCode?.match(/^(\d{4})-?(.*)/);
  const cleanCode = codeMatch?.[2] || courseCode || "";
  let academicYear = codeMatch?.[1] || null;

  if (!academicYear && term?.name) {
    const fullYears = term.name.match(/(\d{4})\D+(\d{4})/);
    if (fullYears) {
      academicYear = fullYears[1].slice(2) + fullYears[2].slice(2);
    } else {
      const shortYears = term.name.match(/(\d{4})\D+(\d{2})\b/);
      if (shortYears) academicYear = shortYears[1].slice(2) + shortYears[2];
    }
  }

  let cleanName = courseName ?? "";
  if (courseCode && cleanName.startsWith(courseCode)) {
    cleanName = cleanName.slice(courseCode.length).trim();
  }
  if (cleanCode && cleanName.startsWith(cleanCode)) {
    cleanName = cleanName.slice(cleanCode.length).trim();
  }
  cleanName = cleanName.replace(/^[-—–:\s]+/, "").trim();

  const slugged = cleanName
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

  const title =
    cleanCode && slugged
      ? `${cleanCode}-${slugged}`
      : cleanCode || slugged || "Untitled-Course";

  return { title, academicYear };
}

function stripHtmlToText(html) {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<h[1-6][^>]*>/gi, "## ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|nbsp|#39);/g, (m) =>
      ({
        "&amp;": "&",
        "&lt;": "<",
        "&gt;": ">",
        "&quot;": '"',
        "&nbsp;": " ",
        "&#39;": "'",
      })[m],
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeZipPart(value, fallback) {
  const raw = String(value ?? "").trim() || fallback;
  const cleaned = raw
    .replace(/[\x00-\x1f\x7f]/g, "")
    .replace(/[\\/]+/g, "-")
    .replace(/^\.+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 180);
}

function entryName(file) {
  return sanitizeZipPart(
    file.display_name ?? file.filename ?? file.name,
    `canvas-file-${file.id ?? "unknown"}`,
  );
}

function withUniquePath(path, seenPaths) {
  let candidate = path;
  let index = 2;
  while (seenPaths.has(candidate)) {
    const dot = path.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${path.slice(0, dot)} (${index})${path.slice(dot)}`
        : `${path} (${index})`;
    index += 1;
  }
  seenPaths.add(candidate);
  return candidate;
}

function pathWithQuery(path, params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(`${key}[]`, String(item));
    } else {
      query.set(key, String(value));
    }
  }
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

function compressionLevel(path) {
  const lower = path.toLowerCase();
  return lower.endsWith(".json") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown") ||
    lower.endsWith(".html")
    ? 6
    : 1;
}

function jsonText(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function markdownFromHtml(title, html, metadata = {}) {
  const lines = [`# ${title}`, ""];
  for (const [key, value] of Object.entries(metadata)) {
    if (value !== undefined && value !== null && value !== "") {
      lines.push(`- ${key}: ${String(value)}`);
    }
  }
  if (Object.keys(metadata).length > 0) lines.push("");
  lines.push(stripHtmlToText(html ?? ""));
  return `${lines.join("\n").trim()}\n`;
}

function addTextEntry(textEntries, seenPaths, path, content) {
  textEntries.push({
    path: withUniquePath(path, seenPaths),
    content:
      typeof content === "string" ? content : jsonText(content ?? null),
  });
}

function addJsonEntry(textEntries, seenPaths, path, value) {
  addTextEntry(textEntries, seenPaths, path, jsonText(value));
}

function addMarkdownEntry(textEntries, seenPaths, path, title, html, metadata) {
  addTextEntry(
    textEntries,
    seenPaths,
    path,
    markdownFromHtml(title, html, metadata),
  );
}

function addJsonEntryIfPresent(textEntries, seenPaths, path, value) {
  if (value !== null && value !== undefined) {
    addJsonEntry(textEntries, seenPaths, path, value);
  }
}

async function getJson(client, path, label, skipped) {
  const { data, forbidden, error } = await client.getPath(path);
  if (forbidden || error) {
    skipped.push(`${label}: ${error ?? "restricted"}`);
    return null;
  }
  return data ?? null;
}

async function getPaginatedJson(client, path, label, skipped) {
  const { data, forbidden, error } = await client.getPaginatedPath(path);
  if (forbidden || error) {
    skipped.push(`${label}: ${error ?? "restricted"}`);
    return [];
  }
  return data ?? [];
}

function collectFile(downloads, file, path, state) {
  if (!file?.url) {
    state.skipped.push(`${path}: missing download URL`);
    return;
  }

  const fileId = file.id ?? file.uuid ?? null;
  if (fileId != null && state.seenFileIds.has(String(fileId))) {
    return;
  }
  if (fileId != null) state.seenFileIds.add(String(fileId));

  downloads.push({
    path: withUniquePath(path, state.seenPaths),
    file,
  });
}

async function collectFileById(client, courseId, fileId, path, downloads, state) {
  const file = await getJson(
    client,
    `/courses/${courseId}/files/${fileId}`,
    path,
    state.skipped,
  );
  if (file) collectFile(downloads, file, `${path}/${entryName(file)}`, state);
}

async function collectSubmissionAttachments(downloads, submission, basePath, state) {
  for (const attachment of submission?.attachments ?? []) {
    collectFile(
      downloads,
      attachment,
      `${basePath}/${entryName(attachment)}`,
      state,
    );
  }

  for (const history of submission?.submission_history ?? []) {
    for (const attachment of history?.attachments ?? []) {
      collectFile(
        downloads,
        attachment,
        `${basePath}/history-${history.attempt ?? "unknown"}/${entryName(attachment)}`,
        state,
      );
    }
  }
}

function isFileLike(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.url === "string" &&
    (value.display_name ||
      value.filename ||
      value.name ||
      value.content_type ||
      value["content-type"] ||
      value.size)
  );
}

function collectDownloadableAttachments(value, basePath, downloads, state) {
  if (!value || typeof value !== "object") return;

  if (isFileLike(value)) {
    collectFile(downloads, value, `${basePath}/${entryName(value)}`, state);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectDownloadableAttachments(item, basePath, downloads, state);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (
      key === "attachments" ||
      key === "attachment" ||
      key === "files" ||
      key === "file" ||
      key === "submission_history" ||
      key === "messages" ||
      key === "entries" ||
      key === "view"
    ) {
      collectDownloadableAttachments(
        child,
        `${basePath}/${key}`,
        downloads,
        state,
      );
    }
  }
}

async function collectContextFiles(client, apiBase, archivePath, archive, state) {
  const quota = await getJson(
    client,
    `${apiBase}/files/quota`,
    `${archivePath}/quota.json`,
    state.skipped,
  );
  addJsonEntryIfPresent(
    archive.textEntries,
    state.seenPaths,
    `${archivePath}/quota.json`,
    quota,
  );

  const folders = await getPaginatedJson(
    client,
    `${apiBase}/folders`,
    `${archivePath}/folders.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${archivePath}/folders.json`,
    folders,
  );

  const files = await getPaginatedJson(
    client,
    `${apiBase}/files`,
    `${archivePath}/files.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${archivePath}/files.json`,
    files,
  );
  for (const file of files) {
    collectFile(
      archive.downloads,
      file,
      `${archivePath}/downloads/${entryName(file)}`,
      state,
    );
  }

  const licenses = await getPaginatedJson(
    client,
    `${apiBase}/content_licenses`,
    `${archivePath}/content-licenses.json`,
    state.skipped,
  );
  if (licenses.length > 0) {
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${archivePath}/content-licenses.json`,
      licenses,
    );
  }
}

async function collectGenericPaginated(client, path, archivePath, archive, state) {
  const data = await getPaginatedJson(client, path, archivePath, state.skipped);
  addJsonEntry(archive.textEntries, state.seenPaths, archivePath, data);
  collectDownloadableAttachments(
    data,
    archivePath.replace(/\.json$/, ""),
    archive.downloads,
    state,
  );
  return data;
}

async function collectGenericObject(client, path, archivePath, archive, state) {
  const data = await getJson(client, path, archivePath, state.skipped);
  if (data) {
    addJsonEntry(archive.textEntries, state.seenPaths, archivePath, data);
    collectDownloadableAttachments(
      data,
      archivePath.replace(/\.json$/, ""),
      archive.downloads,
      state,
    );
  }
  return data;
}

async function collectGroupArchive(client, group, archive, state) {
  const groupId = group.id;
  if (!groupId) return;
  if (state.seenGroupIds.has(String(groupId))) return;
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

  const discussionTopics = await collectGenericPaginated(
    client,
    `/groups/${groupId}/discussion_topics`,
    `${groupPath}/discussions/discussions.json`,
    archive,
    state,
  );
  for (const topicSummary of discussionTopics) {
    const topicId = topicSummary.id;
    if (!topicId) continue;

    const name = sanitizeZipPart(topicSummary.title, `discussion-${topicId}`);
    await collectGenericObject(
      client,
      `/groups/${groupId}/discussion_topics/${topicId}`,
      `${groupPath}/discussions/${name}.json`,
      archive,
      state,
    );
    await collectGenericObject(
      client,
      `/groups/${groupId}/discussion_topics/${topicId}/view`,
      `${groupPath}/discussions/${name}-view.json`,
      archive,
      state,
    );
    await collectGenericPaginated(
      client,
      `/groups/${groupId}/discussion_topics/${topicId}/entries`,
      `${groupPath}/discussions/${name}-entries.json`,
      archive,
      state,
    );
  }

  await collectGenericPaginated(
    client,
    `/groups/${groupId}/collaborations`,
    `${groupPath}/collaborations.json`,
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
  await collectGenericPaginated(
    client,
    `/groups/${groupId}/content_exports`,
    `${groupPath}/content-exports.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/groups/${groupId}/media_objects`,
    `${groupPath}/media/media-objects.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/groups/${groupId}/media_attachments`,
    `${groupPath}/media/media-attachments.json`,
    archive,
    state,
  );
}

async function collectConversationArchive(client, archive, state) {
  await collectGenericObject(
    client,
    "/conversations/unread_count",
    "_account/conversations/unread-count.json",
    archive,
    state,
  );

  const conversationParams = { include: ["participant_avatars"] };
  const conversationLists = [
    {
      path: pathWithQuery("/conversations", conversationParams),
      archivePath: "_account/conversations/inbox.json",
    },
    ...["unread", "starred", "archived", "sent"].map((scope) => ({
      path: pathWithQuery("/conversations", {
        ...conversationParams,
        scope,
      }),
      archivePath: `_account/conversations/${scope}.json`,
    })),
  ];

  const conversationsById = new Map();
  for (const list of conversationLists) {
    const conversations = await collectGenericPaginated(
      client,
      list.path,
      list.archivePath,
      archive,
      state,
    );
    for (const conversation of conversations) {
      if (conversation?.id) {
        conversationsById.set(String(conversation.id), conversation);
      }
    }
  }

  for (const [conversationId, summary] of conversationsById.entries()) {
    const title = sanitizeZipPart(
      summary.subject ?? summary.audience_context_name,
      `conversation-${conversationId}`,
    );
    await collectGenericObject(
      client,
      pathWithQuery(`/conversations/${conversationId}`, conversationParams),
      `_account/conversations/${title}.json`,
      archive,
      state,
    );
  }
}

async function collectAccountArchive(client, archive, state) {
  await collectGenericObject(
    client,
    "/users/self/profile",
    "_account/profile.json",
    archive,
    state,
  );
  await collectGenericObject(
    client,
    "/users/self/settings",
    "_account/settings.json",
    archive,
    state,
  );
  await collectGenericObject(
    client,
    "/accounts/self/account_notifications",
    "_account/account-notifications.json",
    archive,
    state,
  );
  await collectGenericObject(
    client,
    "/users/self/upcoming_events",
    "_account/upcoming-events.json",
    archive,
    state,
  );
  await collectGenericObject(
    client,
    "/users/self/todo",
    "_account/todo.json",
    archive,
    state,
  );
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

  await collectContextFiles(
    client,
    "/users/self",
    "_account/user-files",
    archive,
    state,
  );
  await collectConversationArchive(client, archive, state);

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
  for (const group of groups) {
    await collectGroupArchive(client, group, archive, state);
  }
}

async function collectCourseArchive(client, course, archive, state) {
  const courseId = String(course.id);
  const { title } = cleanCourseName(course.course_code, course.name, course.term);
  const coursePath = sanitizeZipPart(title, `course-${courseId}`);
  const courseSummary = { id: course.id, title, sources: {} };

  const courseDetail = await getJson(
    client,
    pathWithQuery(`/courses/${courseId}`, { include: ["term", "teachers"] }),
    `${coursePath}/course.json`,
    state.skipped,
  );
  addJsonEntry(archive.textEntries, state.seenPaths, `${coursePath}/course.json`, {
    selected_course: course,
    canvas_course: courseDetail,
  });
  if (courseDetail) {
    collectDownloadableAttachments(
      courseDetail,
      `${coursePath}/course`,
      archive.downloads,
      state,
    );
  }

  await collectGenericPaginated(
    client,
    `/courses/${courseId}/tabs`,
    `${coursePath}/tabs.json`,
    archive,
    state,
  );
  await collectGenericObject(
    client,
    `/courses/${courseId}/users/self/progress`,
    `${coursePath}/progress.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/courses/${courseId}/external_tools`,
    `${coursePath}/external-tools.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/courses/${courseId}/content_exports`,
    `${coursePath}/content-exports.json`,
    archive,
    state,
  );
  await collectGenericObject(
    client,
    `/courses/${courseId}/conferences`,
    `${coursePath}/conferences.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/courses/${courseId}/collaborations`,
    `${coursePath}/collaborations.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/courses/${courseId}/media_objects`,
    `${coursePath}/media/media-objects.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/courses/${courseId}/media_attachments`,
    `${coursePath}/media/media-attachments.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    `/courses/${courseId}/outcome_groups`,
    `${coursePath}/outcomes/outcome-groups.json`,
    archive,
    state,
  );
  await collectGenericPaginated(
    client,
    pathWithQuery(`/courses/${courseId}/outcome_results`, {
      user_ids: ["self"],
    }),
    `${coursePath}/outcomes/my-outcome-results.json`,
    archive,
    state,
  );

  const sections = await getPaginatedJson(
    client,
    `/courses/${courseId}/sections`,
    `${coursePath}/sections.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/sections.json`,
    sections,
  );

  const modules = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/modules`, {
      include: ["items", "content_details"],
    }),
    `${coursePath}/modules/modules.json`,
    state.skipped,
  );
  courseSummary.sources.modules = modules.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/modules/modules.json`,
    modules,
  );

  for (const module of modules) {
    const modulePath = `${coursePath}/modules/${sanitizeZipPart(module.name, `module-${module.id}`)}`;
    const moduleDetail = await getJson(
      client,
      pathWithQuery(`/courses/${courseId}/modules/${module.id}`, {
        include: ["items", "content_details"],
      }),
      `${modulePath}/module.json`,
      state.skipped,
    );
    if (moduleDetail) {
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${modulePath}/module.json`,
        moduleDetail,
      );
    }

    const items = await getPaginatedJson(
      client,
      pathWithQuery(`/courses/${courseId}/modules/${module.id}/items`, {
        include: ["content_details"],
      }),
      `${modulePath}/items.json`,
      state.skipped,
    );
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${modulePath}/items.json`,
      items,
    );

    for (const item of items) {
      if (item.id) {
        await collectGenericObject(
          client,
          `/courses/${courseId}/modules/${module.id}/items/${item.id}`,
          `${modulePath}/items/${sanitizeZipPart(
            item.title ?? item.id,
            `item-${item.id}`,
          )}.json`,
          archive,
          state,
        );
      }

      if (item.type === "File" && item.content_id) {
        await collectFileById(
          client,
          courseId,
          item.content_id,
          `${modulePath}/files`,
          archive.downloads,
          state,
        );
      }
    }
  }

  const quota = await getJson(
    client,
    `/courses/${courseId}/files/quota`,
    `${coursePath}/files/quota.json`,
    state.skipped,
  );
  addJsonEntryIfPresent(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/files/quota.json`,
    quota,
  );

  const folders = await getPaginatedJson(
    client,
    `/courses/${courseId}/folders`,
    `${coursePath}/files/folders.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/files/folders.json`,
    folders,
  );

  const courseFiles = await getPaginatedJson(
    client,
    `/courses/${courseId}/files`,
    `${coursePath}/files/course-files.json`,
    state.skipped,
  );
  courseSummary.sources.files = courseFiles.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/files/course-files.json`,
    courseFiles,
  );
  for (const file of courseFiles) {
    collectFile(
      archive.downloads,
      file,
      `${coursePath}/files/all-course-files/${entryName(file)}`,
      state,
    );
  }

  const licenses = await getPaginatedJson(
    client,
    `/courses/${courseId}/content_licenses`,
    `${coursePath}/files/content-licenses.json`,
    state.skipped,
  );
  if (licenses.length > 0) {
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/files/content-licenses.json`,
      licenses,
    );
  }

  const pages = await getPaginatedJson(
    client,
    `/courses/${courseId}/pages`,
    `${coursePath}/pages/pages.json`,
    state.skipped,
  );
  courseSummary.sources.pages = pages.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/pages/pages.json`,
    pages,
  );

  const frontPage = await getJson(
    client,
    `/courses/${courseId}/front_page`,
    `${coursePath}/pages/front-page.json`,
    state.skipped,
  );
  if (frontPage) {
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/pages/front-page.json`,
      frontPage,
    );
    addMarkdownEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/pages/front-page.md`,
      frontPage.title ?? "Front page",
      frontPage.body,
      { url: frontPage.url, updated_at: frontPage.updated_at },
    );
    collectDownloadableAttachments(
      frontPage,
      `${coursePath}/pages/front-page`,
      archive.downloads,
      state,
    );
  }

  for (const pageSummary of pages) {
    const pageId = sanitizeZipPart(
      pageSummary.url ?? pageSummary.page_id ?? pageSummary.title,
      "page",
    );
    const page = await getJson(
      client,
      `/courses/${courseId}/pages/${encodeURIComponent(pageSummary.url)}`,
      `${coursePath}/pages/${pageId}.json`,
      state.skipped,
    );
    if (!page) continue;
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/pages/${pageId}.json`,
      page,
    );
    addMarkdownEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/pages/${pageId}.md`,
      page.title ?? pageSummary.title ?? pageId,
      page.body,
      { url: page.url, updated_at: page.updated_at },
    );
    collectDownloadableAttachments(
      page,
      `${coursePath}/pages/${pageId}`,
      archive.downloads,
      state,
    );

    const revisions = await getPaginatedJson(
      client,
      `/courses/${courseId}/pages/${encodeURIComponent(pageSummary.url)}/revisions`,
      `${coursePath}/pages/${pageId}-revisions.json`,
      state.skipped,
    );
    if (revisions.length > 0) {
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/pages/${pageId}-revisions.json`,
        revisions,
      );
    }
  }

  const announcements = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/discussion_topics`, {
      only_announcements: true,
    }),
    `${coursePath}/announcements/announcements.json`,
    state.skipped,
  );
  courseSummary.sources.announcements = announcements.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/announcements/announcements.json`,
    announcements,
  );

  for (const announcementSummary of announcements) {
    const announcementId = announcementSummary.id;
    const name = sanitizeZipPart(
      announcementSummary.title,
      `announcement-${announcementId}`,
    );
    const announcement = await getJson(
      client,
      `/courses/${courseId}/discussion_topics/${announcementId}`,
      `${coursePath}/announcements/${name}.json`,
      state.skipped,
    );
    if (!announcement) continue;
    addJsonEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/announcements/${name}.json`,
      announcement,
    );
    addMarkdownEntry(
      archive.textEntries,
      state.seenPaths,
      `${coursePath}/announcements/${name}.md`,
      announcement.title ?? name,
      announcement.message,
      { posted_at: announcement.posted_at, delayed_post_at: announcement.delayed_post_at },
    );
    collectDownloadableAttachments(
      announcement,
      `${coursePath}/announcements/${name}`,
      archive.downloads,
      state,
    );
  }

  await collectGenericPaginated(
    client,
    pathWithQuery("/announcements", {
      context_codes: [`course_${courseId}`],
    }),
    `${coursePath}/announcements/global-announcements-api.json`,
    archive,
    state,
  );

  const discussionTopics = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/discussion_topics`, {
      only_announcements: false,
      include: ["all_dates", "sections", "sections_user_count"],
    }),
    `${coursePath}/discussions/discussions.json`,
    state.skipped,
  );
  courseSummary.sources.discussions = discussionTopics.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/discussions/discussions.json`,
    discussionTopics,
  );

  for (const topicSummary of discussionTopics) {
    const topicId = topicSummary.id;
    const name = sanitizeZipPart(topicSummary.title, `discussion-${topicId}`);
    const discussion = await getJson(
      client,
      pathWithQuery(`/courses/${courseId}/discussion_topics/${topicId}`, {
        include: ["all_dates", "sections", "sections_user_count"],
      }),
      `${coursePath}/discussions/${name}.json`,
      state.skipped,
    );
    if (discussion) {
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/discussions/${name}.json`,
        discussion,
      );
      addMarkdownEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/discussions/${name}.md`,
        discussion.title ?? name,
        discussion.message,
        { posted_at: discussion.posted_at, last_reply_at: discussion.last_reply_at },
      );
      collectDownloadableAttachments(
        discussion,
        `${coursePath}/discussions/${name}`,
        archive.downloads,
        state,
      );
    }
    const view = await getJson(
      client,
      `/courses/${courseId}/discussion_topics/${topicId}/view`,
      `${coursePath}/discussions/${name}-view.json`,
      state.skipped,
    );
    if (view) {
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/discussions/${name}-view.json`,
        view,
      );
      collectDownloadableAttachments(
        view,
        `${coursePath}/discussions/${name}-view`,
        archive.downloads,
        state,
      );
    }
    await collectGenericPaginated(
      client,
      `/courses/${courseId}/discussion_topics/${topicId}/entries`,
      `${coursePath}/discussions/${name}-entries.json`,
      archive,
      state,
    );
  }

  const assignmentGroups = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/assignment_groups`, {
      include: ["assignments", "submission"],
    }),
    `${coursePath}/assignments/assignment-groups.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/assignments/assignment-groups.json`,
    assignmentGroups,
  );

  const assignments = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/assignments`, {
      include: ["submission", "rubric"],
    }),
    `${coursePath}/assignments/assignments.json`,
    state.skipped,
  );
  courseSummary.sources.assignments = assignments.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/assignments/assignments.json`,
    assignments,
  );

  const submissions = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/students/submissions`, {
      student_ids: ["self"],
      include: SUBMISSION_INCLUDES,
    }),
    `${coursePath}/submissions/my-submissions.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/submissions/my-submissions.json`,
    submissions,
  );

  for (const assignmentSummary of assignments) {
    const assignmentId = assignmentSummary.id;
    const name = sanitizeZipPart(
      assignmentSummary.name,
      `assignment-${assignmentId}`,
    );
    const assignment = await getJson(
      client,
      pathWithQuery(`/courses/${courseId}/assignments/${assignmentId}`, {
        include: ["submission", "rubric"],
      }),
      `${coursePath}/assignments/${name}/assignment.json`,
      state.skipped,
    );
    if (assignment) {
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/assignments/${name}/assignment.json`,
        assignment,
      );
      addMarkdownEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/assignments/${name}/assignment.md`,
        assignment.name ?? name,
        assignment.description,
        { due_at: assignment.due_at, points_possible: assignment.points_possible },
      );
      for (const attachment of assignment.attachments ?? []) {
        collectFile(
          archive.downloads,
          attachment,
          `${coursePath}/assignments/${name}/attachments/${entryName(attachment)}`,
          state,
        );
      }
      collectDownloadableAttachments(
        assignment,
        `${coursePath}/assignments/${name}`,
        archive.downloads,
        state,
      );
    }

    const submission = await getJson(
      client,
      pathWithQuery(
        `/courses/${courseId}/assignments/${assignmentId}/submissions/self`,
        { include: SUBMISSION_INCLUDES },
      ),
      `${coursePath}/assignments/${name}/my-submission.json`,
      state.skipped,
    );
    if (submission) {
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/assignments/${name}/my-submission.json`,
        submission,
      );
      await collectSubmissionAttachments(
        archive.downloads,
        submission,
        `${coursePath}/assignments/${name}/my-submission-attachments`,
        state,
      );
      collectDownloadableAttachments(
        submission,
        `${coursePath}/assignments/${name}/my-submission`,
        archive.downloads,
        state,
      );
    }

    await collectGenericPaginated(
      client,
      pathWithQuery(
        `/courses/${courseId}/assignments/${assignmentId}/peer_reviews`,
        { include: ["submission_comments", "user"] },
      ),
      `${coursePath}/assignments/${name}/peer-reviews.json`,
      archive,
      state,
    );
  }

  await collectGenericObject(
    client,
    pathWithQuery("/users/self/missing_submissions", {
      course_ids: [courseId],
      include: ["planner_overrides", "course"],
    }),
    `${coursePath}/assignments/missing-submissions.json`,
    archive,
    state,
  );

  const quizzes = await getPaginatedJson(
    client,
    `/courses/${courseId}/quizzes`,
    `${coursePath}/quizzes/quizzes.json`,
    state.skipped,
  );
  courseSummary.sources.quizzes = quizzes.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/quizzes/quizzes.json`,
    quizzes,
  );

  for (const quizSummary of quizzes) {
    const quizId = quizSummary.id;
    const name = sanitizeZipPart(quizSummary.title, `quiz-${quizId}`);
    const quiz = await getJson(
      client,
      `/courses/${courseId}/quizzes/${quizId}`,
      `${coursePath}/quizzes/${name}/quiz.json`,
      state.skipped,
    );
    if (quiz) {
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/quizzes/${name}/quiz.json`,
        quiz,
      );
      addMarkdownEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/quizzes/${name}/quiz.md`,
        quiz.title ?? name,
        quiz.description,
        { due_at: quiz.due_at, points_possible: quiz.points_possible },
      );
    }

    const quizSubmissions = await getPaginatedJson(
      client,
      `/courses/${courseId}/quizzes/${quizId}/submissions`,
      `${coursePath}/quizzes/${name}/submissions.json`,
      state.skipped,
    );
    if (quizSubmissions.length > 0) {
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${coursePath}/quizzes/${name}/submissions.json`,
        quizSubmissions,
      );
    }
    await collectGenericObject(
      client,
      `/courses/${courseId}/quizzes/${quizId}/submissions/self`,
      `${coursePath}/quizzes/${name}/my-submission.json`,
      archive,
      state,
    );
    await collectGenericPaginated(
      client,
      `/courses/${courseId}/quizzes/${quizId}/questions`,
      `${coursePath}/quizzes/${name}/questions.json`,
      archive,
      state,
    );
  }

  const calendarEvents = await getPaginatedJson(
    client,
    pathWithQuery("/calendar_events", {
      context_codes: [`course_${courseId}`],
    }),
    `${coursePath}/calendar/calendar-events.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/calendar/calendar-events.json`,
    calendarEvents,
  );

  const plannerItems = await getPaginatedJson(
    client,
    pathWithQuery("/planner/items", {
      context_codes: [`course_${courseId}`],
    }),
    `${coursePath}/planner/planner-items.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/planner/planner-items.json`,
    plannerItems,
  );

  const gradingStandards = await getPaginatedJson(
    client,
    `/courses/${courseId}/grading_standards`,
    `${coursePath}/grades/grading-standards.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/grades/grading-standards.json`,
    gradingStandards,
  );

  const enrollments = await getPaginatedJson(
    client,
    pathWithQuery("/users/self/enrollments", {
      course_id: courseId,
      state: ["active", "invited", "completed", "inactive"],
    }),
    `${coursePath}/grades/my-enrollments.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/grades/my-enrollments.json`,
    enrollments,
  );

  const rubrics = await collectGenericPaginated(
    client,
    pathWithQuery(`/courses/${courseId}/rubrics`, {
      include: ["associations", "assessments"],
    }),
    `${coursePath}/rubrics/rubrics.json`,
    archive,
    state,
  );
  for (const rubricSummary of rubrics) {
    const rubricId = rubricSummary.id;
    if (!rubricId) continue;

    const name = sanitizeZipPart(rubricSummary.title, `rubric-${rubricId}`);
    await collectGenericObject(
      client,
      pathWithQuery(`/courses/${courseId}/rubrics/${rubricId}`, {
        include: ["assessments", "graded_assessments", "peer_assessments"],
        style: "full",
      }),
      `${coursePath}/rubrics/${name}.json`,
      archive,
      state,
    );
  }

  const groups = await collectGenericPaginated(
    client,
    `/courses/${courseId}/groups`,
    `${coursePath}/groups/groups.json`,
    archive,
    state,
  );
  for (const group of groups) {
    await collectGroupArchive(client, group, archive, state);
  }

  archive.manifest.courses.push(courseSummary);
}

export async function discoverCanvasRawExportEntries(
  client,
  courses,
  options = {},
) {
  const archive = {
    downloads: [],
    textEntries: [],
    skipped: [],
    manifest: {
      generated_at: new Date().toISOString(),
      export_type: "canvas-full-readonly-archive",
      courses: [],
    },
  };
  if (Array.isArray(options.skipped)) {
    archive.skipped.push(...options.skipped);
  }
  if (options.courseDiscovery) {
    archive.manifest.course_discovery = options.courseDiscovery;
  }

  const state = {
    seenPaths: new Set(),
    seenFileIds: new Set(),
    seenGroupIds: new Set(),
    skipped: archive.skipped,
  };

  await collectAccountArchive(client, archive, state);

  for (const course of courses) {
    await collectCourseArchive(client, course, archive, state);
  }

  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    "_canvas-export-manifest.json",
    {
      ...archive.manifest,
      binary_file_count: archive.downloads.length,
      generated_file_count: archive.textEntries.length + 2,
      skipped_count: archive.skipped.length,
    },
  );

  return archive;
}

function pushTextEntry(zip, path, text) {
  const entry = new ZipDeflate(path, { level: 6 });
  zip.add(entry);
  entry.push(new TextEncoder().encode(text), true);
}

export function createCanvasRawExportZipStream(client, archive) {
  return new ReadableStream({
    start(controller) {
      const zip = new Zip();
      let closed = false;

      zip.ondata = (err, data, final) => {
        if (err) {
          closed = true;
          controller.error(err);
          return;
        }
        if (data.length > 0) controller.enqueue(data);
        if (final) {
          closed = true;
          controller.close();
        }
      };

      void (async () => {
        const skipped = [...archive.skipped];
        let downloaded = 0;

        try {
          for (const entry of archive.textEntries) {
            pushTextEntry(zip, entry.path, entry.content);
          }

          for (const entry of archive.downloads) {
            const { buffer, forbidden, error } = await client.downloadFile(
              entry.file.url,
            );

            if (forbidden || !buffer) {
              skipped.push(`${entry.path}: ${error ?? "restricted"}`);
              continue;
            }

            const zipEntry = new ZipDeflate(entry.path, {
              level: compressionLevel(entry.path),
            });
            zip.add(zipEntry);
            zipEntry.push(new Uint8Array(buffer), true);
            downloaded += 1;
          }

          const summary = [
            "Canvas full read-only archive",
            `Generated metadata/content files: ${archive.textEntries.length}`,
            `Downloaded binary files: ${downloaded}`,
            `Skipped files/resources: ${skipped.length}`,
            "",
            ...skipped.map((item) => `- ${item}`),
          ].join("\n");
          pushTextEntry(zip, "_canvas-export-summary.txt", `${summary}\n`);
          zip.end();
        } catch (error) {
          if (!closed) controller.error(error);
        }
      })();
    },
  });
}
