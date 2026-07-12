# canvas-mcp Tool Manifest

> Status: Active hand-maintained tool inventory
>
> Audience: Integrators, security reviewers, and contributors
>
> Last verified: 2026-07-11 against `src/tools/*.ts`

The server registers all 129 standalone tool objects across 15 Canvas domains.
That count includes reads, self-state updates, creates, submissions, grading,
messaging, and destructive educator/admin operations. Every listed tool is
visible in `tools/list`; section placement does not disable it.

The tables separate primarily read-oriented tools from mutating or
elevated-permission tools to make review easier. The safety column deliberately
does not guess a Canvas role: permissions vary by institution, enrollment, and
resource. `Confirm; verify Canvas permission` means both checks are required;
it does not imply that only an educator or administrator can call the tool.
Some tools in the first group still change the authenticated user's state, such
as marking an item complete or a conversation read. Review the HTTP method,
description, and source before allowing an agent to call any tool. Treat
pre-authenticated download URLs as sensitive bearer capabilities until expiry.
Treat every `DELETE` endpoint and bulk-removal tool as potentially irreversible;
require explicit confirmation immediately before the call.

Canvas permission checks constrain the supplied token, but the server has no
caller authentication, domain allowlist, per-tool authorization, or
confirmation layer. See `README.md` before deployment.

Tool names in this manifest were matched to code on the verification date.
Runtime Zod schemas and handlers remain authoritative for exact inputs and
behavior. “Sources” records the reference projects that most directly informed
a tool; it is provenance context, not a license conclusion.

---

## courses

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_courses | GET /api/v1/courses | enrollment_state?, include[]? | vishalsachdev, r-huijts, DMontgomery40 | paginated internally |
| canvas_get_course | GET /api/v1/courses/:id | course_id, include[]? | r-huijts, DMontgomery40 | include[] supports `syllabus_body`, `term`, `course_progress`, `public_description` |
| canvas_list_sections | GET /api/v1/courses/:id/sections | course_id | r-huijts, DMontgomery40 | paginated internally |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_course | POST /api/v1/accounts/:account_id/courses | Confirm; verify Canvas permission |

---

## assignments

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_assignments | GET /api/v1/courses/:course_id/assignments | course_id, bucket?, include[]?, search_term?, per_page? | vishalsachdev, r-huijts, DMontgomery40 | paginated; bucket supports `past`, `overdue`, `undated`, `ungraded`, `unsubmitted`, `upcoming`, `future`; include[] supports `submission`, `all_dates`, `overrides` |
| canvas_get_assignment | GET /api/v1/courses/:course_id/assignments/:id | course_id, assignment_id, include[]? | r-huijts, DMontgomery40 | include[] supports `submission`, `rubric`, `assignment_visibility` |
| canvas_list_assignment_groups | GET /api/v1/courses/:course_id/assignment_groups | course_id, include[]? | r-huijts, ahnopologetic, DMontgomery40 | include[] supports `assignments`, `submission` |
| canvas_list_missing_assignments | GET /api/v1/users/self/missing_submissions | course_ids[]?, include[]?, filter[]? | mtgibbs | student-facing; filter[] supports `submittable`, `current_grading_period` |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_assignment | POST /api/v1/courses/:course_id/assignments | Confirm; verify Canvas permission |
| canvas_update_assignment | PUT /api/v1/courses/:course_id/assignments/:id | Confirm; verify Canvas permission |
| canvas_delete_assignment | DELETE /api/v1/courses/:course_id/assignments/:id | Confirm; verify Canvas permission |
| canvas_create_assignment_group | POST /api/v1/courses/:course_id/assignment_groups | Confirm; verify Canvas permission |
| canvas_bulk_update_assignment_dates | PUT /api/v1/courses/:course_id/assignments/bulk_update | Confirm; verify Canvas permission |
| canvas_assign_peer_review | POST /api/v1/courses/:course_id/assignments/:id/peer_reviews | Confirm; verify Canvas permission |

---

## submissions

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_get_my_submission | GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions/self | course_id, assignment_id, include[]? | vishalsachdev, ahnopologetic | include[] supports `submission_comments`, `rubric_assessment`, `submission_history` |
| canvas_list_my_submissions | GET /api/v1/courses/:course_id/students/submissions | course_id, student_ids[]?, workflow_state?, include[]? | ahnopologetic, mtgibbs | defaults `student_ids=[self]`; paginated |
| canvas_get_submission_comments | GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id | course_id, assignment_id, user_id? | Kuria-Mbatia, r-huijts | wraps include[]=submission_comments |
| canvas_list_peer_reviews_todo | GET /api/v1/users/self/todo | — | vishalsachdev | filters todo items for `reviewing` type |
| canvas_list_peer_reviews_for_assignment | GET /api/v1/courses/:course_id/assignments/:assignment_id/peer_reviews | course_id, assignment_id, include[]? | vishalsachdev, Kuria-Mbatia | include[] supports `submission_comments`, `user` |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_submit_assignment | POST /api/v1/courses/:course_id/assignments/:id/submissions | Self-mutation; confirm |
| canvas_grade_submission | PUT /api/v1/courses/:course_id/assignments/:id/submissions/:user_id | Confirm; verify Canvas permission |
| canvas_bulk_grade_submissions | POST /api/v1/courses/:course_id/assignments/:id/submissions/update_grades | Confirm; verify Canvas permission |
| canvas_post_submission_comment | PUT /api/v1/courses/:course_id/assignments/:id/submissions/:user_id (comment[]) | Confirm; verify Canvas permission |
| canvas_list_section_submissions | GET /api/v1/sections/:section_id/students/submissions | Confirm; verify Canvas permission |

---

## grades

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_get_my_grades | GET /api/v1/users/self/enrollments | course_id?, state[]?, limit? | vishalsachdev, DMontgomery40, mtgibbs | returns enrollment objects with current_score, final_score, current_grade, final_grade, and grading-period fields. state defaults to active+invited. limit is client-side |
| canvas_get_assignment_feedback | GET /api/v1/courses/:course_id/assignments/:id/submissions/self | course_id, assignment_id | mtgibbs | wraps grading comments + rubric assessment |
| canvas_get_grading_standards | GET /api/v1/courses/:course_id/grading_standards | course_id | r-huijts | letter-grade thresholds for the course |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_submit_grade | PUT /api/v1/courses/:course_id/assignments/:id/submissions/:user_id | Confirm; verify Canvas permission |
| canvas_get_all_students_status | GET /api/v1/courses/:course_id/students/submissions | Confirm; verify Canvas permission |
| canvas_get_comprehensive_status | (composite grade + submission roll-up) | Confirm; verify Canvas permission |

---

## modules

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_modules | GET /api/v1/courses/:course_id/modules | course_id, include[]?, search_term? | vishalsachdev, r-huijts, DMontgomery40 | paginated; include[] supports `items`, `content_details` |
| canvas_get_module | GET /api/v1/courses/:course_id/modules/:id | course_id, module_id, include[]? | DMontgomery40 | |
| canvas_list_module_items | GET /api/v1/courses/:course_id/modules/:module_id/items | course_id, module_id, include[]? | vishalsachdev, r-huijts, DMontgomery40 | paginated; include[] supports `content_details` |
| canvas_get_module_item | GET /api/v1/courses/:course_id/modules/:module_id/items/:id | course_id, module_id, item_id | DMontgomery40 | |
| canvas_get_module_item_sequence | GET /api/v1/courses/:course_id/module_item_sequence | course_id, asset_type, asset_id | Kuria-Mbatia | next/prev navigation |
| canvas_mark_module_item_read | POST /api/v1/courses/:course_id/modules/:module_id/items/:id/mark_read | course_id, module_id, item_id | Kuria-Mbatia | mutates student progress state |
| canvas_mark_module_item_done | PUT /api/v1/courses/:course_id/modules/:module_id/items/:id/done | course_id, module_id, item_id | DMontgomery40, Kuria-Mbatia | mutates student progress state |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_module | POST /api/v1/courses/:course_id/modules | Confirm; verify Canvas permission |
| canvas_update_module | PUT /api/v1/courses/:course_id/modules/:id | Confirm; verify Canvas permission |
| canvas_delete_module | DELETE /api/v1/courses/:course_id/modules/:id | Confirm; verify Canvas permission |
| canvas_add_module_item | POST /api/v1/courses/:course_id/modules/:module_id/items | Confirm; verify Canvas permission |
| canvas_update_module_item | PUT /api/v1/courses/:course_id/modules/:module_id/items/:id | Confirm; verify Canvas permission |
| canvas_delete_module_item | DELETE /api/v1/courses/:course_id/modules/:module_id/items/:id | Confirm; verify Canvas permission |
| canvas_toggle_module_publish | PUT /api/v1/courses/:course_id/modules/:id | Confirm; verify Canvas permission |

---

## pages

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_pages | GET /api/v1/courses/:course_id/pages | course_id, sort?, search_term?, published? | vishalsachdev, r-huijts, DMontgomery40 | paginated |
| canvas_get_page | GET /api/v1/courses/:course_id/pages/:url_or_id | course_id, page_url_or_id | vishalsachdev, r-huijts, DMontgomery40 | returns `body` HTML |
| canvas_get_front_page | GET /api/v1/courses/:course_id/front_page | course_id | vishalsachdev | |
| canvas_list_page_revisions | GET /api/v1/courses/:course_id/pages/:url_or_id/revisions | course_id, page_url_or_id | r-huijts | paginated |
| canvas_get_page_revision | GET /api/v1/courses/:course_id/pages/:url_or_id/revisions/:revision_id | course_id, page_url_or_id, revision_id, summary? | r-huijts | |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_page | POST /api/v1/courses/:course_id/pages | Confirm; verify Canvas permission |
| canvas_update_page | PUT /api/v1/courses/:course_id/pages/:url_or_id | Confirm; verify Canvas permission |
| canvas_delete_page | DELETE /api/v1/courses/:course_id/pages/:url_or_id | Confirm; verify Canvas permission |
| canvas_revert_page_revision | POST /api/v1/courses/:course_id/pages/:url_or_id/revisions/:revision_id | Confirm; verify Canvas permission |

---

## calendar

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_calendar_events | GET /api/v1/calendar_events | context_codes[]?, start_date?, end_date?, type? | aryankeluskar, ahnopologetic, DMontgomery40 | paginated; `type` can be `event` or `assignment` |
| canvas_list_upcoming_events | GET /api/v1/users/self/upcoming_events | type?, days?, limit? | DMontgomery40, mtgibbs | canonical "what's coming up" tool. Canvas returns assignments + events merged; type/days/limit are client-side filters |
| canvas_list_planner_items | GET /api/v1/planner/items | start_date?, end_date?, context_codes[]? | ahnopologetic, Kuria-Mbatia | student planner surface |
| canvas_list_todo_items | GET /api/v1/users/self/todo | — | vishalsachdev, mtgibbs | todo entries: grading, submitting, reviewing |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_calendar_event | POST /api/v1/calendar_events | Confirm; verify Canvas permission |
| canvas_update_calendar_event | PUT /api/v1/calendar_events/:id | Confirm; verify Canvas permission |
| canvas_delete_calendar_event | DELETE /api/v1/calendar_events/:id | Confirm; verify Canvas permission |
| canvas_create_planner_note | POST /api/v1/planner_notes | Confirm; verify Canvas permission |
| canvas_update_planner_note | PUT /api/v1/planner_notes/:id | Confirm; verify Canvas permission |
| canvas_delete_planner_note | DELETE /api/v1/planner_notes/:id | Confirm; verify Canvas permission |
| canvas_mark_planner_item_complete | PUT /api/v1/planner/overrides/:id | Self-mutation; confirm |

---

## announcements

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_announcements | GET /api/v1/announcements | context_codes[], start_date?, end_date?, active_only? | vishalsachdev, DMontgomery40, mtgibbs | `context_codes[]` required, e.g. `course_123`; paginated |
| canvas_list_course_announcements | GET /api/v1/courses/:course_id/discussion_topics?only_announcements=true | course_id, per_page? | vishalsachdev | paginated |
| canvas_get_announcement | GET /api/v1/courses/:course_id/discussion_topics/:topic_id | course_id, announcement_id | vishalsachdev | announcements are discussion topics with `is_announcement=true` |
| canvas_list_account_notifications | GET /api/v1/accounts/self/account_notifications | — | Kuria-Mbatia | global institution-wide notices |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_announcement | POST /api/v1/courses/:course_id/discussion_topics | Confirm; verify Canvas permission |
| canvas_delete_announcement | DELETE /api/v1/courses/:course_id/discussion_topics/:id | Confirm; verify Canvas permission |
| canvas_bulk_delete_announcements | (composite) | Confirm; verify Canvas permission |

---

## discussions

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_discussion_topics | GET /api/v1/courses/:course_id/discussion_topics | course_id, only_announcements?, search_term?, include[]? | vishalsachdev, r-huijts, DMontgomery40 | paginated |
| canvas_get_discussion_topic | GET /api/v1/courses/:course_id/discussion_topics/:topic_id | course_id, topic_id, include[]? | vishalsachdev, DMontgomery40 | |
| canvas_get_discussion_view | GET /api/v1/courses/:course_id/discussion_topics/:topic_id/view | course_id, topic_id | ahnopologetic, Kuria-Mbatia | full threaded view with replies |
| canvas_list_discussion_entries | GET /api/v1/courses/:course_id/discussion_topics/:topic_id/entries | course_id, topic_id | vishalsachdev | paginated |
| canvas_get_discussion_entry | GET /api/v1/courses/:course_id/discussion_topics/:topic_id/entries/:entry_id | course_id, topic_id, entry_id | vishalsachdev | |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_discussion_topic | POST /api/v1/courses/:course_id/discussion_topics | Confirm; verify Canvas permission |
| canvas_post_discussion_entry | POST /api/v1/courses/:course_id/discussion_topics/:topic_id/entries | Confirm; verify Canvas permission |
| canvas_reply_to_discussion_entry | POST /api/v1/courses/:course_id/discussion_topics/:topic_id/entries/:entry_id/replies | Confirm; verify Canvas permission |
| canvas_delete_discussion_topic | DELETE /api/v1/courses/:course_id/discussion_topics/:id | Confirm; verify Canvas permission |

---

## files

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_course_files | GET /api/v1/courses/:course_id/files | course_id, search_term?, content_types[]?, sort? | vishalsachdev, ahnopologetic, DMontgomery40 | paginated |
| canvas_list_folders | GET /api/v1/courses/:course_id/folders | course_id | DMontgomery40 | paginated |
| canvas_list_folder_files | GET /api/v1/folders/:folder_id/files | folder_id | DMontgomery40 | paginated |
| canvas_get_file | GET /api/v1/files/:id | file_id, include[]? | ahnopologetic, DMontgomery40 | include[] supports `user`, `usage_rights` |
| canvas_get_file_download_url | GET /api/v1/files/:id | file_id | aryankeluskar, Kuria-Mbatia | returns a credential-sensitive pre-authenticated `url`; do not log it |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_upload_file | POST /api/v1/courses/:course_id/files (3-step flow) | Confirm; verify Canvas permission |
| canvas_delete_file | DELETE /api/v1/files/:id | Confirm; verify Canvas permission |
| canvas_download_file_to_disk | GET /api/v1/files/:id | Sensitive URL output; ignores `destination_path`; do not log |

---

## messages

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_conversations | GET /api/v1/conversations | scope?, filter[]?, include[]? | vishalsachdev, mtgibbs, DMontgomery40 | paginated; scope supports `unread`, `starred`, `archived`, `sent` |
| canvas_get_conversation | GET /api/v1/conversations/:id | conversation_id, include[]? | vishalsachdev, DMontgomery40 | include[] supports `participant_avatars` |
| canvas_get_unread_count | GET /api/v1/conversations/unread_count | — | vishalsachdev, mtgibbs | |
| canvas_mark_conversation_read | PUT /api/v1/conversations/:id | conversation_id, workflow_state? | vishalsachdev | mutates conversation read state |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_send_conversation | POST /api/v1/conversations | Confirm; verify Canvas permission |
| canvas_reply_to_conversation | POST /api/v1/conversations/:id/add_message | Confirm; verify Canvas permission |
| canvas_send_bulk_messages | POST /api/v1/conversations (recipients[]) | Confirm; verify Canvas permission |
| canvas_delete_conversation | DELETE /api/v1/conversations/:id | Confirm; verify Canvas permission |

---

## notifications

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_activity_stream | GET /api/v1/users/self/activity_stream | only_active_courses? | DMontgomery40, Kuria-Mbatia | paginated; consolidates announcements, discussions, submissions, conversations |
| canvas_get_activity_stream_summary | GET /api/v1/users/self/activity_stream/summary | — | DMontgomery40 | counts by category |
| canvas_list_communication_channels | GET /api/v1/users/self/communication_channels | — | DMontgomery40 | returns email/push channels (used to interpret notification preferences) |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_dismiss_account_notification | DELETE /api/v1/accounts/self/account_notifications/:id | Confirm; verify Canvas permission |
| canvas_update_notification_preference | PUT /api/v1/users/self/communication_channels/:id/notification_preferences/:notification | Confirm; verify Canvas permission |

---

## profile

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_get_my_profile | GET /api/v1/users/self/profile | — | DMontgomery40, r-huijts, ahnopologetic | |
| canvas_get_user_profile | GET /api/v1/users/:user_id/profile | user_id | DMontgomery40 | student can fetch visible profiles in shared courses |
| canvas_get_my_settings | GET /api/v1/users/self/settings | — | DMontgomery40 | |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_update_user_profile | PUT /api/v1/users/:id | Confirm; verify Canvas permission |
| canvas_update_my_settings | PUT /api/v1/users/self/settings | Confirm; verify Canvas permission |
| canvas_create_user | POST /api/v1/accounts/:account_id/users | Confirm; verify Canvas permission |

---

## quizzes

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_quizzes | GET /api/v1/courses/:course_id/quizzes | course_id, search_term? | r-huijts, ahnopologetic, DMontgomery40 | paginated |
| canvas_get_quiz | GET /api/v1/courses/:course_id/quizzes/:id | course_id, quiz_id | r-huijts, ahnopologetic, DMontgomery40 | |
| canvas_list_my_quiz_submissions | GET /api/v1/courses/:course_id/quizzes/:quiz_id/submissions | course_id, quiz_id | DMontgomery40 | filters by self; includes score/attempts |
| canvas_get_my_quiz_submission | GET /api/v1/courses/:course_id/quizzes/:quiz_id/submissions/self | course_id, quiz_id | DMontgomery40 | |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_quiz | POST /api/v1/courses/:course_id/quizzes | Confirm; verify Canvas permission |
| canvas_update_quiz | PUT /api/v1/courses/:course_id/quizzes/:id | Confirm; verify Canvas permission |
| canvas_delete_quiz | DELETE /api/v1/courses/:course_id/quizzes/:id | Confirm; verify Canvas permission |
| canvas_list_quiz_questions | GET /api/v1/courses/:course_id/quizzes/:quiz_id/questions | Confirm; verify Canvas permission |
| canvas_create_quiz_question | POST /api/v1/courses/:course_id/quizzes/:quiz_id/questions | Confirm; verify Canvas permission |
| canvas_update_quiz_question | PUT /api/v1/courses/:course_id/quizzes/:quiz_id/questions/:id | Confirm; verify Canvas permission |
| canvas_delete_quiz_question | DELETE /api/v1/courses/:course_id/quizzes/:quiz_id/questions/:id | Confirm; verify Canvas permission |
| canvas_list_quiz_question_groups | GET /api/v1/courses/:course_id/quizzes/:quiz_id/groups | Confirm; verify Canvas permission |
| canvas_start_quiz_attempt | POST /api/v1/courses/:course_id/quizzes/:quiz_id/submissions | Self-mutation; confirm |

---

## rubrics

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_rubrics | GET /api/v1/courses/:course_id/rubrics | course_id, include[]? | vishalsachdev, r-huijts, DMontgomery40 | paginated; include[] supports `associations`, `assessments` |
| canvas_get_rubric | GET /api/v1/courses/:course_id/rubrics/:id | course_id, rubric_id, include[]?, style? | vishalsachdev, r-huijts, DMontgomery40 | include[] supports `assessments`, `graded_assessments`, `peer_assessments`; `style` = `full` or `comments_only` |
| canvas_get_rubric_statistics | GET /api/v1/courses/:course_id/rubrics/:id (include[]=assessments) | course_id, rubric_id | r-huijts | computed client-side from assessments |
| canvas_get_my_rubric_assessment | GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions/self (include[]=rubric_assessment) | course_id, assignment_id | vishalsachdev | student's own rubric scoring for an assignment |

### Mutating or elevated-permission tools (registered)

| Tool | Endpoint | Safety |
|------|----------|--------|
| canvas_create_rubric | POST /api/v1/courses/:course_id/rubrics | Confirm; verify Canvas permission |
| canvas_update_rubric | PUT /api/v1/courses/:course_id/rubrics/:id | Confirm; verify Canvas permission |
| canvas_delete_rubric | DELETE /api/v1/courses/:course_id/rubrics/:id | Confirm; verify Canvas permission |
| canvas_associate_rubric | POST /api/v1/courses/:course_id/rubric_associations | Confirm; verify Canvas permission |
| canvas_grade_with_rubric | PUT /api/v1/courses/:course_id/assignments/:id/submissions/:user_id (rubric_assessment) | Confirm; verify Canvas permission |
