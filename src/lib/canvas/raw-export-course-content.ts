import type { CanvasRecord } from "./client";
import {
  addJsonEntry,
  addMarkdownEntry,
  collectDownloadableAttachments,
  collectGenericPaginated,
  getJson,
  getPaginatedJson,
  isRecord,
  pathWithQuery,
  sanitizeZipPart,
} from "./raw-export-helpers";
import type { CourseExportContext } from "./raw-export-types";

function addPageEntries(
  context: CourseExportContext,
  page: CanvasRecord,
  pageId: string,
  fallbackTitle: unknown,
) {
  const { coursePath, archive, state } = context;
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
    page.title ?? fallbackTitle ?? pageId,
    page.body,
    { url: page.url, updated_at: page.updated_at },
  );
  collectDownloadableAttachments(
    page,
    `${coursePath}/pages/${pageId}`,
    archive.downloads,
    state,
  );
}

async function collectFrontPage(context: CourseExportContext) {
  const { client, courseId, coursePath, state } = context;
  const page = await getJson(
    client,
    `/courses/${courseId}/front_page`,
    `${coursePath}/pages/front-page.json`,
    state.skipped,
  );
  if (!isRecord(page)) return;
  addPageEntries(context, page, "front-page", "Front page");
}

async function collectPage(
  context: CourseExportContext,
  pageSummary: CanvasRecord,
) {
  const { client, courseId, coursePath, archive, state } = context;
  const pageId = sanitizeZipPart(
    pageSummary.url ?? pageSummary.page_id ?? pageSummary.title,
    "page",
  );
  const encodedUrl = encodeURIComponent(String(pageSummary.url ?? ""));
  const page = await getJson(
    client,
    `/courses/${courseId}/pages/${encodedUrl}`,
    `${coursePath}/pages/${pageId}.json`,
    state.skipped,
  );
  if (!isRecord(page)) return;
  addPageEntries(context, page, pageId, pageSummary.title);
  const revisions = await getPaginatedJson(
    client,
    `/courses/${courseId}/pages/${encodedUrl}/revisions`,
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

export async function collectCoursePages(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state, summary } = context;
  const pages = await getPaginatedJson(
    client,
    `/courses/${courseId}/pages`,
    `${coursePath}/pages/pages.json`,
    state.skipped,
  );
  summary.sources.pages = pages.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/pages/pages.json`,
    pages,
  );
  await collectFrontPage(context);
  for (const page of pages) await collectPage(context, page);
}

async function collectAnnouncement(
  context: CourseExportContext,
  announcementSummary: CanvasRecord,
) {
  const { client, courseId, coursePath, archive, state } = context;
  const id = announcementSummary.id;
  const name = sanitizeZipPart(announcementSummary.title, `announcement-${id}`);
  const announcement = await getJson(
    client,
    `/courses/${courseId}/discussion_topics/${id}`,
    `${coursePath}/announcements/${name}.json`,
    state.skipped,
  );
  if (!isRecord(announcement)) return;
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
    {
      posted_at: announcement.posted_at,
      delayed_post_at: announcement.delayed_post_at,
    },
  );
  collectDownloadableAttachments(
    announcement,
    `${coursePath}/announcements/${name}`,
    archive.downloads,
    state,
  );
}

export async function collectCourseAnnouncements(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state, summary } = context;
  const announcements = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/discussion_topics`, {
      only_announcements: true,
    }),
    `${coursePath}/announcements/announcements.json`,
    state.skipped,
  );
  summary.sources.announcements = announcements.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/announcements/announcements.json`,
    announcements,
  );
  for (const announcement of announcements)
    await collectAnnouncement(context, announcement);
  await collectGenericPaginated(
    client,
    pathWithQuery("/announcements", { context_codes: [`course_${courseId}`] }),
    `${coursePath}/announcements/global-announcements-api.json`,
    archive,
    state,
  );
}

async function collectDiscussion(
  context: CourseExportContext,
  topic: CanvasRecord,
) {
  const { client, courseId, coursePath, archive, state } = context;
  const id = topic.id;
  const name = sanitizeZipPart(topic.title, `discussion-${id}`);
  const params = { include: ["all_dates", "sections", "sections_user_count"] };
  const discussion = await getJson(
    client,
    pathWithQuery(`/courses/${courseId}/discussion_topics/${id}`, params),
    `${coursePath}/discussions/${name}.json`,
    state.skipped,
  );
  if (isRecord(discussion)) {
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
      {
        posted_at: discussion.posted_at,
        last_reply_at: discussion.last_reply_at,
      },
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
    `/courses/${courseId}/discussion_topics/${id}/view`,
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
    `/courses/${courseId}/discussion_topics/${id}/entries`,
    `${coursePath}/discussions/${name}-entries.json`,
    archive,
    state,
  );
}

export async function collectCourseDiscussions(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state, summary } = context;
  const topics = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/discussion_topics`, {
      only_announcements: false,
      include: ["all_dates", "sections", "sections_user_count"],
    }),
    `${coursePath}/discussions/discussions.json`,
    state.skipped,
  );
  summary.sources.discussions = topics.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/discussions/discussions.json`,
    topics,
  );
  for (const topic of topics) await collectDiscussion(context, topic);
}
