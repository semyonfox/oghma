#!/usr/bin/env node
// Live verification against Canvas. Calls each active tool's handler with
// sensible arguments discovered from prior calls. Logs to stdout (tee to file).
//
// Usage: CANVAS_API_TOKEN=... CANVAS_DOMAIN=... node scripts/verify-tools.mjs

import { CanvasClient } from "../dist/canvas/client.js";
import { allTools } from "../dist/tools/index.js";

const token = process.env.CANVAS_API_TOKEN;
const domain = process.env.CANVAS_DOMAIN;
if (!token || !domain) {
    console.error("missing CANVAS_API_TOKEN or CANVAS_DOMAIN");
    process.exit(1);
}

const canvas = new CanvasClient({ domain, token });
const ctx = { canvas };

// side-effect tools — skip by default
const SIDE_EFFECT = new Set([
    "canvas_mark_module_item_read",
    "canvas_mark_module_item_done",
    "canvas_mark_conversation_read",
]);

const results = { ok: 0, err: 0, skipped: 0, noArgs: 0 };

async function run(toolName, args) {
    const tool = allTools.find((t) => t.name === toolName);
    if (!tool) {
        console.log(`MISSING ${toolName}`);
        return null;
    }
    if (SIDE_EFFECT.has(toolName)) {
        results.skipped++;
        console.log(`\n=== ${toolName} ===\nSKIPPED (side effect — needs explicit confirmation)`);
        return null;
    }
    const parsed = tool.inputSchema.safeParse(args ?? {});
    if (!parsed.success) {
        results.err++;
        console.log(`\n=== ${toolName} ===\nSCHEMA_FAIL ${parsed.error.message}`);
        return null;
    }
    try {
        const result = await tool.handler(parsed.data, ctx);
        const text = result.content[0]?.text ?? "";
        const preview = text.length > 400 ? text.slice(0, 400) + "…" : text;
        console.log(`\n=== ${toolName} ===\nargs: ${JSON.stringify(args ?? {})}\nOK (${text.length} chars)\n${preview}`);
        results.ok++;
        try { return JSON.parse(text); } catch { return text; }
    } catch (err) {
        results.err++;
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`\n=== ${toolName} ===\nargs: ${JSON.stringify(args ?? {})}\nFAIL ${msg}`);
        return null;
    }
}

function pickFirst(arr, prop) {
    if (!Array.isArray(arr) || arr.length === 0) return undefined;
    return prop ? arr[0]?.[prop] : arr[0];
}

console.log(`# canvas-mcp tool verification\ndomain: ${domain}\ntotal active tools: ${allTools.length}\n`);

// ---- Phase 1: no-arg / self-scoped discovery ----
const courses = await run("canvas_list_courses", { enrollment_state: "active" });
const courseId = pickFirst(courses, "id");
console.log(`\n[discovered] courseId = ${courseId}`);

await run("canvas_get_my_profile", {});
await run("canvas_get_my_settings", {});
await run("canvas_get_my_grades", {});
await run("canvas_list_missing_assignments", {});
await run("canvas_list_upcoming_events", {});
await run("canvas_list_upcoming_events", { type: "assignment", days: 7, limit: 5 });
await run("canvas_list_calendar_events", {});
await run("canvas_list_planner_items", {});
await run("canvas_list_todo_items", {});
await run("canvas_list_account_notifications", {});
await run("canvas_list_conversations", {});
await run("canvas_get_unread_count", {});
await run("canvas_list_activity_stream", {});
await run("canvas_get_activity_stream_summary", {});
await run("canvas_list_communication_channels", {});
await run("canvas_list_peer_reviews_todo", {});

const myProfile = await run("canvas_get_my_profile", {});
const myUserId = myProfile?.id;
console.log(`\n[discovered] myUserId = ${myUserId}`);

if (myUserId) {
    await run("canvas_get_user_profile", { user_id: myUserId });
}

// ---- Phase 2: course-scoped ----
if (!courseId) {
    console.log("\n\nNo course available — skipping course-scoped tools.");
} else {
    await run("canvas_get_course", { course_id: courseId });
    await run("canvas_list_sections", { course_id: courseId });

    const assignments = await run("canvas_list_assignments", { course_id: courseId });
    const assignmentId = pickFirst(assignments, "id");
    console.log(`\n[discovered] assignmentId = ${assignmentId}`);

    await run("canvas_list_assignment_groups", { course_id: courseId });

    if (assignmentId) {
        await run("canvas_get_assignment", { course_id: courseId, assignment_id: assignmentId });
        await run("canvas_get_my_submission", { course_id: courseId, assignment_id: assignmentId });
        await run("canvas_get_submission_comments", { course_id: courseId, assignment_id: assignmentId });
        await run("canvas_get_assignment_feedback", { course_id: courseId, assignment_id: assignmentId });
        await run("canvas_get_my_rubric_assessment", { course_id: courseId, assignment_id: assignmentId });
        await run("canvas_list_peer_reviews_for_assignment", { course_id: courseId, assignment_id: assignmentId });
    }

    await run("canvas_list_my_submissions", { course_id: courseId });

    const modules = await run("canvas_list_modules", { course_id: courseId });
    const moduleId = pickFirst(modules, "id");
    console.log(`\n[discovered] moduleId = ${moduleId}`);

    if (moduleId) {
        await run("canvas_get_module", { course_id: courseId, module_id: moduleId });
        const items = await run("canvas_list_module_items", { course_id: courseId, module_id: moduleId });
        const moduleItemId = pickFirst(items, "id");
        console.log(`\n[discovered] moduleItemId = ${moduleItemId}`);
        if (moduleItemId) {
            await run("canvas_get_module_item", { course_id: courseId, module_id: moduleId, item_id: moduleItemId });
            await run("canvas_get_module_item_sequence", { course_id: courseId, asset_type: "ModuleItem", asset_id: moduleItemId });
        }
    }

    const pages = await run("canvas_list_pages", { course_id: courseId });
    const pageUrl = pickFirst(pages, "url");
    console.log(`\n[discovered] pageUrl = ${pageUrl}`);

    if (pageUrl) {
        await run("canvas_get_page", { course_id: courseId, page_url_or_id: pageUrl });
        const revs = await run("canvas_list_page_revisions", { course_id: courseId, page_url_or_id: pageUrl });
        const revisionId = pickFirst(revs, "revision_id");
        if (revisionId) {
            await run("canvas_get_page_revision", { course_id: courseId, page_url_or_id: pageUrl, revision_id: revisionId });
        } else {
            console.log("\n=== canvas_get_page_revision ===\nSKIPPED (no revisions on page)");
            results.skipped++;
        }
    }
    await run("canvas_get_front_page", { course_id: courseId });

    await run("canvas_list_announcements", { context_codes: [`course_${courseId}`] });
    await run("canvas_list_course_announcements", { course_id: courseId });
    const topics = await run("canvas_list_discussion_topics", { course_id: courseId });
    const topicId = pickFirst(topics, "id");
    console.log(`\n[discovered] topicId = ${topicId}`);
    if (topicId) {
        await run("canvas_get_discussion_topic", { course_id: courseId, topic_id: topicId });
        await run("canvas_get_discussion_view", { course_id: courseId, topic_id: topicId });
        const entries = await run("canvas_list_discussion_entries", { course_id: courseId, topic_id: topicId });
        const entryId = pickFirst(entries, "id");
        if (entryId) {
            await run("canvas_get_discussion_entry", { course_id: courseId, topic_id: topicId, entry_id: entryId });
        } else {
            console.log("\n=== canvas_get_discussion_entry ===\nSKIPPED (no entries on topic)");
            results.skipped++;
        }
        const firstAnn = await run("canvas_list_announcements", { context_codes: [`course_${courseId}`] });
        const annId = pickFirst(firstAnn, "id");
        if (annId) await run("canvas_get_announcement", { topic_id: annId });
    }

    const files = await run("canvas_list_course_files", { course_id: courseId });
    const fileId = pickFirst(files, "id");
    if (fileId) {
        await run("canvas_get_file", { file_id: fileId });
        await run("canvas_get_file_download_url", { file_id: fileId });
    }
    const folders = await run("canvas_list_folders", { course_id: courseId });
    const folderId = pickFirst(folders, "id");
    if (folderId) {
        await run("canvas_list_folder_files", { folder_id: folderId });
    }

    const quizzes = await run("canvas_list_quizzes", { course_id: courseId });
    const quizId = pickFirst(quizzes, "id");
    if (quizId) {
        await run("canvas_get_quiz", { course_id: courseId, quiz_id: quizId });
        await run("canvas_list_my_quiz_submissions", { course_id: courseId, quiz_id: quizId });
        await run("canvas_get_my_quiz_submission", { course_id: courseId, quiz_id: quizId });
    } else {
        console.log("\n=== canvas_get_quiz / submissions ===\nSKIPPED (no quizzes)");
        results.skipped += 3;
    }

    const rubrics = await run("canvas_list_rubrics", { course_id: courseId });
    const rubricId = pickFirst(rubrics, "id");
    if (rubricId) {
        await run("canvas_get_rubric", { course_id: courseId, rubric_id: rubricId });
        await run("canvas_get_rubric_statistics", { course_id: courseId, rubric_id: rubricId });
    } else {
        console.log("\n=== canvas_get_rubric / statistics ===\nSKIPPED (no rubrics in course)");
        results.skipped += 2;
    }

    await run("canvas_get_grading_standards", { course_id: courseId });
}

// conversation-scoped
const convos = await run("canvas_list_conversations", {});
const convoId = pickFirst(convos, "id");
if (convoId) {
    await run("canvas_get_conversation", { conversation_id: convoId });
} else {
    console.log("\n=== canvas_get_conversation ===\nSKIPPED (inbox empty)");
    results.skipped++;
}

// side-effect tools: note explicitly
for (const name of SIDE_EFFECT) await run(name, {});

console.log(`\n\n# Summary\nOK: ${results.ok}\nFAIL: ${results.err}\nSKIPPED: ${results.skipped}\ntotal invocations: ${results.ok + results.err + results.skipped}`);
