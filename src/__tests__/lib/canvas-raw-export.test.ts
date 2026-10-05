import { describe, expect, it } from "vitest";
import { discoverCanvasRawExportEntries } from "@/lib/canvas/raw-export";

function result(data: unknown) {
  return { data, forbidden: false };
}

function orderedLines(value: string) {
  return value.trim().split("\n");
}

describe("Canvas raw archive export", () => {
  it("collects Canvas-native content and binary downloads", async () => {
    const requests: string[] = [];
    const client = {
      getPath: async (path: string) => {
        requests.push(`get ${path}`);
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
        requests.push(`paginated ${path}`);
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
      orderedLines(`
_account/user-files/downloads/profile.pdf
_account/conversations/Inbox/messages/attachments/inbox-attachment.txt
_groups/Project Group/files/downloads/group-file.pdf
CT216-Software-Engineering/modules/Week 1/files/slides.pdf
CT216-Software-Engineering/files/all-course-files/course-file.pdf
CT216-Software-Engineering/assignments/Essay/attachments/brief.docx
CT216-Software-Engineering/assignments/Essay/my-submission-attachments/submission.pdf
      `),
    );
    expect(textEntryPaths).toEqual(
      orderedLines(`
_account/profile.json
_account/account-notifications.json
_account/upcoming-events.json
_account/todo.json
_account/activity-stream.json
_account/bookmarks.json
_account/communication-messages.json
_account/content-exports.json
_account/media/media-objects.json
_account/media/media-attachments.json
_account/calendar/calendar-events.json
_account/planner/planner-items.json
_account/user-files/quota.json
_account/user-files/folders.json
_account/user-files/files.json
_account/conversations/unread-count.json
_account/conversations/inbox.json
_account/conversations/unread.json
_account/conversations/starred.json
_account/conversations/archived.json
_account/conversations/sent.json
_account/conversations/Inbox.json
_account/groups/groups.json
_account/groups/favorite-groups.json
_groups/Project Group/group.json
_groups/Project Group/files/folders.json
_groups/Project Group/files/files.json
_groups/Project Group/discussions/discussions.json
_groups/Project Group/discussions/Group chat.json
_groups/Project Group/discussions/Group chat-entries.json
_groups/Project Group/collaborations.json
_groups/Project Group/content-exports.json
_groups/Project Group/media/media-objects.json
_groups/Project Group/media/media-attachments.json
CT216-Software-Engineering/course.json
CT216-Software-Engineering/tabs.json
CT216-Software-Engineering/external-tools.json
CT216-Software-Engineering/content-exports.json
CT216-Software-Engineering/collaborations.json
CT216-Software-Engineering/media/media-objects.json
CT216-Software-Engineering/media/media-attachments.json
CT216-Software-Engineering/outcomes/outcome-groups.json
CT216-Software-Engineering/outcomes/my-outcome-results.json
CT216-Software-Engineering/sections.json
CT216-Software-Engineering/modules/modules.json
CT216-Software-Engineering/modules/Week 1/module.json
CT216-Software-Engineering/modules/Week 1/items.json
CT216-Software-Engineering/files/folders.json
CT216-Software-Engineering/files/course-files.json
CT216-Software-Engineering/pages/pages.json
CT216-Software-Engineering/pages/front-page.json
CT216-Software-Engineering/pages/front-page.md
CT216-Software-Engineering/pages/week-1.json
CT216-Software-Engineering/pages/week-1.md
CT216-Software-Engineering/pages/week-1-revisions.json
CT216-Software-Engineering/announcements/announcements.json
CT216-Software-Engineering/announcements/Announcement.json
CT216-Software-Engineering/announcements/Announcement.md
CT216-Software-Engineering/announcements/global-announcements-api.json
CT216-Software-Engineering/discussions/discussions.json
CT216-Software-Engineering/discussions/Discussion.json
CT216-Software-Engineering/discussions/Discussion.md
CT216-Software-Engineering/discussions/Discussion-view.json
CT216-Software-Engineering/discussions/Discussion-entries.json
CT216-Software-Engineering/assignments/assignment-groups.json
CT216-Software-Engineering/assignments/assignments.json
CT216-Software-Engineering/submissions/my-submissions.json
CT216-Software-Engineering/assignments/Essay/assignment.json
CT216-Software-Engineering/assignments/Essay/assignment.md
CT216-Software-Engineering/assignments/Essay/my-submission.json
CT216-Software-Engineering/assignments/Essay/peer-reviews.json
CT216-Software-Engineering/quizzes/quizzes.json
CT216-Software-Engineering/quizzes/Quiz/quiz.json
CT216-Software-Engineering/quizzes/Quiz/quiz.md
CT216-Software-Engineering/quizzes/Quiz/submissions.json
CT216-Software-Engineering/quizzes/Quiz/questions.json
CT216-Software-Engineering/calendar/calendar-events.json
CT216-Software-Engineering/planner/planner-items.json
CT216-Software-Engineering/grades/grading-standards.json
CT216-Software-Engineering/grades/my-enrollments.json
CT216-Software-Engineering/rubrics/rubrics.json
CT216-Software-Engineering/rubrics/Course Rubric.json
CT216-Software-Engineering/groups/groups.json
_canvas-export-manifest.json
      `),
    );
    expect(requests).toEqual(
      orderedLines(`
get /users/self/profile
get /users/self/settings
get /accounts/self/account_notifications
get /users/self/upcoming_events
get /users/self/todo
paginated /users/self/activity_stream?only_active_courses=false
get /users/self/activity_stream/summary
get /users/self/communication_channels
paginated /users/self/bookmarks
paginated /comm_messages
get /conferences
paginated /users/self/content_exports
paginated /media_objects
paginated /media_attachments
paginated /calendar_events?all_events=true
paginated /planner/items
get /users/self/missing_submissions
get /users/self/files/quota
paginated /users/self/folders
paginated /users/self/files
paginated /users/self/content_licenses
get /conversations/unread_count
paginated /conversations?include%5B%5D=participant_avatars
paginated /conversations?include%5B%5D=participant_avatars&scope=unread
paginated /conversations?include%5B%5D=participant_avatars&scope=starred
paginated /conversations?include%5B%5D=participant_avatars&scope=archived
paginated /conversations?include%5B%5D=participant_avatars&scope=sent
get /conversations/900?include%5B%5D=participant_avatars
paginated /users/self/groups
paginated /users/self/favorites/groups
get /groups/77/files/quota
paginated /groups/77/folders
paginated /groups/77/files
paginated /groups/77/content_licenses
paginated /groups/77/discussion_topics
get /groups/77/discussion_topics/78
get /groups/77/discussion_topics/78/view
paginated /groups/77/discussion_topics/78/entries
paginated /groups/77/collaborations
get /groups/77/conferences
paginated /groups/77/content_exports
paginated /groups/77/media_objects
paginated /groups/77/media_attachments
get /courses/123?include%5B%5D=term&include%5B%5D=teachers
paginated /courses/123/tabs
get /courses/123/users/self/progress
paginated /courses/123/external_tools
paginated /courses/123/content_exports
get /courses/123/conferences
paginated /courses/123/collaborations
paginated /courses/123/media_objects
paginated /courses/123/media_attachments
paginated /courses/123/outcome_groups
paginated /courses/123/outcome_results?user_ids%5B%5D=self
paginated /courses/123/sections
paginated /courses/123/modules?include%5B%5D=items&include%5B%5D=content_details
get /courses/123/modules/7?include%5B%5D=items&include%5B%5D=content_details
paginated /courses/123/modules/7/items?include%5B%5D=content_details
get /courses/123/modules/7/items/8
get /courses/123/files/11
get /courses/123/files/quota
paginated /courses/123/folders
paginated /courses/123/files
paginated /courses/123/content_licenses
paginated /courses/123/pages
get /courses/123/front_page
get /courses/123/pages/week-1
paginated /courses/123/pages/week-1/revisions
paginated /courses/123/discussion_topics?only_announcements=true
get /courses/123/discussion_topics/21
paginated /announcements?context_codes%5B%5D=course_123
paginated /courses/123/discussion_topics?only_announcements=false&include%5B%5D=all_dates&include%5B%5D=sections&include%5B%5D=sections_user_count
get /courses/123/discussion_topics/22?include%5B%5D=all_dates&include%5B%5D=sections&include%5B%5D=sections_user_count
get /courses/123/discussion_topics/22/view
paginated /courses/123/discussion_topics/22/entries
paginated /courses/123/assignment_groups?include%5B%5D=assignments&include%5B%5D=submission
paginated /courses/123/assignments?include%5B%5D=submission&include%5B%5D=rubric
paginated /courses/123/students/submissions?student_ids%5B%5D=self&include%5B%5D=submission_comments&include%5B%5D=rubric_assessment&include%5B%5D=submission_history&include%5B%5D=attachments&include%5B%5D=assignment
get /courses/123/assignments/31?include%5B%5D=submission&include%5B%5D=rubric
get /courses/123/assignments/31/submissions/self?include%5B%5D=submission_comments&include%5B%5D=rubric_assessment&include%5B%5D=submission_history&include%5B%5D=attachments&include%5B%5D=assignment
paginated /courses/123/assignments/31/peer_reviews?include%5B%5D=submission_comments&include%5B%5D=user
get /users/self/missing_submissions?course_ids%5B%5D=123&include%5B%5D=planner_overrides&include%5B%5D=course
paginated /courses/123/quizzes
get /courses/123/quizzes/51
paginated /courses/123/quizzes/51/submissions
get /courses/123/quizzes/51/submissions/self
paginated /courses/123/quizzes/51/questions
paginated /calendar_events?context_codes%5B%5D=course_123
paginated /planner/items?context_codes%5B%5D=course_123
paginated /courses/123/grading_standards
paginated /users/self/enrollments?course_id=123&state%5B%5D=active&state%5B%5D=invited&state%5B%5D=completed&state%5B%5D=inactive
paginated /courses/123/rubrics?include%5B%5D=associations&include%5B%5D=assessments
get /courses/123/rubrics/88?include%5B%5D=assessments&include%5B%5D=graded_assessments&include%5B%5D=peer_assessments&style=full
paginated /courses/123/groups
      `),
    );
    expect(archive.skipped).toEqual([]);

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
