import type { ToolDef } from "./types";
import { courseTools } from "./courses";
import { assignmentTools } from "./assignments";
import { submissionTools } from "./submissions";
import { gradeTools } from "./grades";
import { moduleTools } from "./modules";
import { pageTools } from "./pages";
import { calendarTools } from "./calendar";
import { announcementTools } from "./announcements";
import { discussionTools } from "./discussions";
import { fileTools } from "./files";
import { messageTools } from "./messages";
import { notificationTools } from "./notifications";
import { profileTools } from "./profile";
import { quizTools } from "./quizzes";
import { rubricTools } from "./rubrics";

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
