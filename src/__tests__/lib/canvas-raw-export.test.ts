import { describe, expect, it } from "vitest";
import { discoverCanvasRawExportEntries } from "@/lib/canvas/raw-export.js";

function result(data: unknown) {
  return { data, forbidden: false };
}

describe("Canvas raw archive export", () => {
  it("collects Canvas-native content and binary downloads", async () => {
    const client = {
      getPath: async (path: string) => {
        if (path === "/users/self/profile") {
          return result({ id: "self", name: "Student" });
        }
        if (path === "/users/self/files/quota") {
          return result({ quota: 1000, quota_used: 100 });
        }
        if (path === "/accounts/self/account_notifications") {
          return result([{ id: 1, subject: "Global notice" }]);
        }
        if (path === "/users/self/upcoming_events") {
          return result([{ id: 2, title: "Upcoming" }]);
        }
        if (path === "/users/self/todo") {
          return result([{ id: 3, type: "submitting" }]);
        }
        if (path === "/conversations/unread_count") {
          return result({ unread_count: 1 });
        }
        if (path.startsWith("/conversations/900?")) {
          return result({
            id: 900,
            subject: "Inbox",
            messages: [
              {
                body: "See attached",
                attachments: [
                  {
                    id: 14,
                    display_name: "inbox-attachment.txt",
                    filename: "inbox-attachment.txt",
                    url: "https://canvas.example/files/14",
                  },
                ],
              },
            ],
          });
        }
        if (path.startsWith("/courses/123?")) {
          return result({ id: 123, name: "Software Engineering" });
        }
        if (path === "/courses/123/modules/7?include%5B%5D=items&include%5B%5D=content_details") {
          return result({ id: 7, name: "Week 1" });
        }
        if (path === "/courses/123/files/11") {
          return result({
            id: 11,
            display_name: "slides.pdf",
            filename: "slides.pdf",
            url: "https://canvas.example/files/11",
          });
        }
        if (path === "/courses/123/front_page") {
          return result({
            title: "Front",
            url: "front",
            body: "<p>Welcome</p>",
          });
        }
        if (path === "/courses/123/pages/week-1") {
          return result({
            title: "Week 1",
            url: "week-1",
            body: "<h1>Lecture</h1><p>Read this</p>",
          });
        }
        if (path === "/courses/123/discussion_topics/21") {
          return result({
            id: 21,
            title: "Announcement",
            message: "<p>Exam update</p>",
          });
        }
        if (path === "/courses/123/discussion_topics/22?include%5B%5D=all_dates&include%5B%5D=sections&include%5B%5D=sections_user_count") {
          return result({
            id: 22,
            title: "Discussion",
            message: "<p>Question?</p>",
          });
        }
        if (path === "/courses/123/discussion_topics/22/view") {
          return result({ participants: [], view: [] });
        }
        if (path === "/courses/123/assignments/31?include%5B%5D=submission&include%5B%5D=rubric") {
          return result({
            id: 31,
            name: "Essay",
            description: "<p>Write it</p>",
            attachments: [
              {
                id: 12,
                display_name: "brief.docx",
                filename: "brief.docx",
                url: "https://canvas.example/files/12",
              },
            ],
          });
        }
        if (path.startsWith("/courses/123/assignments/31/submissions/self?")) {
          return result({
            id: 41,
            attachments: [
              {
                id: 13,
                display_name: "submission.pdf",
                filename: "submission.pdf",
                url: "https://canvas.example/files/13",
              },
            ],
          });
        }
        if (path === "/courses/123/quizzes/51") {
          return result({
            id: 51,
            title: "Quiz",
            description: "<p>Quiz notes</p>",
          });
        }
        if (path.startsWith("/courses/123/rubrics/88?")) {
          return result({ id: 88, title: "Course Rubric" });
        }
        if (path === "/groups/77/discussion_topics/78") {
          return result({
            id: 78,
            title: "Group chat",
            message: "<p>Group notes</p>",
          });
        }
        return result(null);
      },
      getPaginatedPath: async (path: string) => {
        if (path === "/users/self/files") {
          return result([
            {
              id: 15,
              display_name: "profile.pdf",
              filename: "profile.pdf",
              url: "https://canvas.example/files/15",
            },
          ]);
        }
        if (path.startsWith("/conversations?") && path.includes("scope=")) {
          return result([]);
        }
        if (path.startsWith("/conversations?include")) {
          return result([{ id: 900, subject: "Inbox" }]);
        }
        if (path === "/users/self/groups") {
          return result([{ id: 77, name: "Project Group" }]);
        }
        if (path === "/groups/77/files") {
          return result([
            {
              id: 16,
              display_name: "group-file.pdf",
              filename: "group-file.pdf",
              url: "https://canvas.example/files/16",
            },
          ]);
        }
        if (path === "/groups/77/discussion_topics") {
          return result([{ id: 78, title: "Group chat" }]);
        }
        if (path === "/courses/123/sections") return result([{ id: 4 }]);
        if (path.startsWith("/courses/123/modules?")) {
          return result([{ id: 7, name: "Week 1" }]);
        }
        if (path.startsWith("/courses/123/modules/7/items?")) {
          return result([{ id: 8, type: "File", content_id: 11 }]);
        }
        if (path === "/courses/123/folders") return result([{ id: 9 }]);
        if (path === "/courses/123/files") {
          return result([
            {
              id: 10,
              display_name: "course-file.pdf",
              filename: "course-file.pdf",
              url: "https://canvas.example/files/10",
            },
          ]);
        }
        if (path === "/courses/123/pages") {
          return result([{ page_id: 20, title: "Week 1", url: "week-1" }]);
        }
        if (path === "/courses/123/pages/week-1/revisions") {
          return result([{ revision_id: 1 }]);
        }
        if (path === "/courses/123/discussion_topics?only_announcements=true") {
          return result([{ id: 21, title: "Announcement" }]);
        }
        if (path.startsWith("/courses/123/discussion_topics?only_announcements=false")) {
          return result([{ id: 22, title: "Discussion" }]);
        }
        if (path.startsWith("/courses/123/assignment_groups?")) {
          return result([{ id: 30, name: "Assignments" }]);
        }
        if (path.startsWith("/courses/123/assignments?")) {
          return result([{ id: 31, name: "Essay" }]);
        }
        if (path.startsWith("/courses/123/students/submissions?")) {
          return result([{ id: 41, assignment_id: 31 }]);
        }
        if (path === "/courses/123/quizzes") {
          return result([{ id: 51, title: "Quiz" }]);
        }
        if (path === "/courses/123/quizzes/51/submissions") {
          return result([{ id: 61, quiz_id: 51 }]);
        }
        if (path.startsWith("/calendar_events?")) {
          return result([{ id: 71, title: "Lecture" }]);
        }
        if (path.startsWith("/planner/items?")) {
          return result([{ id: 81, title: "Plan" }]);
        }
        if (path === "/courses/123/grading_standards") return result([]);
        if (path.startsWith("/users/self/enrollments?")) {
          return result([{ course_id: 123, grades: { current_score: 80 } }]);
        }
        if (path.startsWith("/courses/123/rubrics?")) {
          return result([{ id: 88, title: "Course Rubric" }]);
        }
        if (path === "/courses/123/groups") {
          return result([{ id: 77, name: "Project Group" }]);
        }
        return result([]);
      },
    };

    const archive = await discoverCanvasRawExportEntries(client, [
      {
        id: 123,
        name: "2526-CT216 Software Engineering",
        course_code: "2526-CT216",
        term: { name: "2025/2026" },
      },
    ]);

    const downloadPaths = archive.downloads.map(
      (entry: { path: string }) => entry.path,
    );
    const textEntryPaths = archive.textEntries.map(
      (entry: { path: string }) => entry.path,
    );

    expect(downloadPaths).toEqual(
      expect.arrayContaining([
        "CT216-Software-Engineering/modules/Week 1/files/slides.pdf",
        "CT216-Software-Engineering/files/all-course-files/course-file.pdf",
        "CT216-Software-Engineering/assignments/Essay/attachments/brief.docx",
        "CT216-Software-Engineering/assignments/Essay/my-submission-attachments/submission.pdf",
        "_account/user-files/downloads/profile.pdf",
        "_account/conversations/Inbox/messages/attachments/inbox-attachment.txt",
        "_groups/Project Group/files/downloads/group-file.pdf",
      ]),
    );
    expect(textEntryPaths).toEqual(
      expect.arrayContaining([
        "_account/account-notifications.json",
        "CT216-Software-Engineering/pages/week-1.md",
        "CT216-Software-Engineering/announcements/Announcement.md",
        "CT216-Software-Engineering/discussions/Discussion-view.json",
        "CT216-Software-Engineering/quizzes/Quiz/quiz.md",
        "CT216-Software-Engineering/calendar/calendar-events.json",
        "CT216-Software-Engineering/planner/planner-items.json",
        "CT216-Software-Engineering/grades/my-enrollments.json",
        "CT216-Software-Engineering/rubrics/rubrics.json",
        "_account/profile.json",
        "_account/conversations/inbox.json",
        "_groups/Project Group/discussions/discussions.json",
        "_canvas-export-manifest.json",
      ]),
    );
  });
});
