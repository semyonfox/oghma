import type { ToolDef } from "./types.js";
import { courseTools } from "./courses.js";
import { assignmentTools } from "./assignments.js";
import { submissionTools } from "./submissions.js";
import { gradeTools } from "./grades.js";
import { moduleTools } from "./modules.js";
import { pageTools } from "./pages.js";
import { calendarTools } from "./calendar.js";
import { announcementTools } from "./announcements.js";
import { discussionTools } from "./discussions.js";
import { fileTools } from "./files.js";
import { messageTools } from "./messages.js";
import { notificationTools } from "./notifications.js";
import { profileTools } from "./profile.js";
import { quizTools } from "./quizzes.js";
import { rubricTools } from "./rubrics.js";

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
