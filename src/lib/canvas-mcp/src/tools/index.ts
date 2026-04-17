import type { ToolDef } from "./types.ts";
import { courseTools } from "./courses.ts";
import { assignmentTools } from "./assignments.ts";
import { submissionTools } from "./submissions.ts";
import { gradeTools } from "./grades.ts";
import { moduleTools } from "./modules.ts";
import { pageTools } from "./pages.ts";
import { calendarTools } from "./calendar.ts";
import { announcementTools } from "./announcements.ts";
import { discussionTools } from "./discussions.ts";
import { fileTools } from "./files.ts";
import { messageTools } from "./messages.ts";
import { notificationTools } from "./notifications.ts";
import { profileTools } from "./profile.ts";
import { quizTools } from "./quizzes.ts";
import { rubricTools } from "./rubrics.ts";

export const allTools: ToolDef[] = [
    ...courseTools,
    ...assignmentTools,
    ...submissionTools,
    ...gradeTools,
    ...moduleTools,
    ...pageTools,
    ...calendarTools,
    ...announcementTools,
    ...discussionTools,
    ...fileTools,
    ...messageTools,
    ...notificationTools,
    ...profileTools,
    ...quizTools,
    ...rubricTools,
];
