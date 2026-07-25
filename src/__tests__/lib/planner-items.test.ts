import { describe, expect, it } from "vitest";
import { buildAssignmentDedupeKey, choosePlannerDates, normalizePlannerItem, normalizePlannableType } from "@/lib/canvas/planner-items.js";

describe("Canvas planner-item normalization", () => {
  it("normalizes explicit Canvas plannable types without title heuristics", () => {
    expect(normalizePlannableType({ plannable_type: "assignment" })).toBe("assignment");
    expect(normalizePlannableType({ plannable_type: "quiz" })).toBe("quiz");
    expect(normalizePlannableType({ plannable_type: "discussion_topic" })).toBe("discussion_topic");
    expect(normalizePlannableType({ plannable_type: "wiki_page" })).toBe("other");
    expect(normalizePlannableType({ title: "Quiz 1" })).toBe("other");
  });

  it("uses announcement context flags instead of title text", () => {
    expect(normalizePlannableType({ plannable_type: "discussion_topic" }, { isAnnouncement: true })).toBe("announcement");
    expect(normalizePlannableType({ title: "Announcement: exam" })).toBe("other");
  });

  it("keeps display and due dates distinct with explainable date_source", () => {
    expect(choosePlannerDates({ plannable_type: "assignment", due_at: "2026-03-01T12:00:00Z", plannable_date: "2026-02-20T09:00:00Z" })).toEqual({ display_at: "2026-03-01T12:00:00Z", due_at: "2026-03-01T12:00:00Z", available_at: null, end_at: null, date_source: "due_at", all_day: false });
    expect(choosePlannerDates({ plannable_type: "announcement", posted_at: "2026-02-01T09:00:00Z", due_at: "2026-03-01T12:00:00Z" })).toMatchObject({ display_at: "2026-02-01T09:00:00Z", due_at: null, date_source: "posted_at" });
  });

  it("stores undated rows but marks date_source as none", () => {
    expect(choosePlannerDates({ plannable_type: "planner_note" })).toMatchObject({ display_at: null, due_at: null, date_source: "none" });
  });

  it("normalizes a planner object to the public/storage contract", () => {
    const normalized = normalizePlannerItem({ context_type: "Course", course_id: 42, context_name: "CS101", plannable_type: "discussion_topic", plannable_id: 99, plannable: { id: 99, title: "Week 1 discussion", message: "<p>Discuss</p>", html_url: "https://canvas.example/courses/42/discussion_topics/99", todo_date: "2026-02-02T10:00:00Z" } }, { canvasDomain: "canvas.example", canvasUserId: 7 });
    expect(normalized).toMatchObject({ canvas_domain: "canvas.example", canvas_user_id: 7, canvas_course_id: 42, canvas_context_type: "Course", context_name: "CS101", plannable_type: "discussion_topic", plannable_id: "99", title: "Week 1 discussion", body: "<p>Discuss</p>", html_url: "https://canvas.example/courses/42/discussion_topics/99", display_at: "2026-02-02T10:00:00Z", due_at: null, date_source: "todo_date", item_state: "active" });
  });

  it("builds assignment-backed dedupe keys from stable assignment identities", () => {
    expect(buildAssignmentDedupeKey({ plannable_type: "assignment", plannable_id: "123" })).toBe("assignment:123");
    expect(buildAssignmentDedupeKey({ plannable_type: "quiz", plannable_id: "456" })).toBe("assignment:456");
    expect(buildAssignmentDedupeKey({ plannable_type: "announcement", plannable_id: "789" })).toBeNull();
  });
});
