import type { CanvasCourseSelection } from "./id";
import {
  addJsonEntry,
  addJsonEntryIfPresent,
  collectDownloadableAttachments,
  collectFile,
  collectFileById,
  collectGenericObject,
  collectGenericPaginated,
  entryName,
  getJson,
  getPaginatedJson,
  pathWithQuery,
  sanitizeZipPart,
} from "./raw-export-helpers";
import type { CourseExportContext } from "./raw-export-types";

export async function collectCourseOverview(
  context: CourseExportContext,
  course: CanvasCourseSelection,
) {
  const { client, courseId, coursePath, archive, state } = context;
  const detail = await getJson(
    client,
    pathWithQuery(`/courses/${courseId}`, { include: ["term", "teachers"] }),
    `${coursePath}/course.json`,
    state.skipped,
  );
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/course.json`,
    {
      selected_course: course,
      canvas_course: detail,
    },
  );
  if (detail) {
    collectDownloadableAttachments(
      detail,
      `${coursePath}/course`,
      archive.downloads,
      state,
    );
  }
  await collectCourseServices(context);
  await collectCourseOutcomes(context);
}

async function collectCourseServices(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state } = context;
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
}

async function collectCourseOutcomes(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state } = context;
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
}

async function collectModuleItems(
  context: CourseExportContext,
  moduleId: unknown,
  modulePath: string,
) {
  const { client, courseId, archive, state } = context;
  const items = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/modules/${moduleId}/items`, {
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
      const name = sanitizeZipPart(item.title ?? item.id, `item-${item.id}`);
      await collectGenericObject(
        client,
        `/courses/${courseId}/modules/${moduleId}/items/${item.id}`,
        `${modulePath}/items/${name}.json`,
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

export async function collectCourseModules(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state, summary } = context;
  const modules = await getPaginatedJson(
    client,
    pathWithQuery(`/courses/${courseId}/modules`, {
      include: ["items", "content_details"],
    }),
    `${coursePath}/modules/modules.json`,
    state.skipped,
  );
  summary.sources.modules = modules.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/modules/modules.json`,
    modules,
  );
  for (const module of modules) {
    const modulePath = `${coursePath}/modules/${sanitizeZipPart(module.name, `module-${module.id}`)}`;
    const detail = await getJson(
      client,
      pathWithQuery(`/courses/${courseId}/modules/${module.id}`, {
        include: ["items", "content_details"],
      }),
      `${modulePath}/module.json`,
      state.skipped,
    );
    if (detail)
      addJsonEntry(
        archive.textEntries,
        state.seenPaths,
        `${modulePath}/module.json`,
        detail,
      );
    await collectModuleItems(context, module.id, modulePath);
  }
}

export async function collectCourseFiles(context: CourseExportContext) {
  const { client, courseId, coursePath, archive, state, summary } = context;
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
  const files = await getPaginatedJson(
    client,
    `/courses/${courseId}/files`,
    `${coursePath}/files/course-files.json`,
    state.skipped,
  );
  summary.sources.files = files.length;
  addJsonEntry(
    archive.textEntries,
    state.seenPaths,
    `${coursePath}/files/course-files.json`,
    files,
  );
  for (const file of files) {
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
}
