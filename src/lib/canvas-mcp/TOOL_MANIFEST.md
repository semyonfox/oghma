# canvas-mcp tool manifest

The full tool surface across 15 Canvas domains, produced from a cross-reference sweep of 12 open-source Canvas MCP reference repos (see `ATTRIBUTION.md`). All 129 tools are registered by default — reads, writes, creates, deletes — and Canvas's own permission model gates what any given token can actually do. The tables below preserve the historical split between student-safe reads (**active**) and instructor/admin writes (**admin / educator**) for readability only; both sections are live in code.

All tool names follow `canvas_<verb>_<noun>` in snake_case. Endpoints are Canvas LMS REST API paths (`/api/v1/...`). Where the Canvas API supports `include[]`, pagination, or `enrollment_state` filters, these are called out in the notes column. "Sources" lists 1-3 reference repos whose implementations most directly informed the tool design; it is not exhaustive.

---

## courses

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_courses | GET /api/v1/courses | enrollment_state?, state[]?, include[]?, per_page? | vishalsachdev, r-huijts, DMontgomery40 | paginated; include[] supports `term`, `teachers`, `total_students`, `favorites` |
| canvas_get_course | GET /api/v1/courses/:id | course_id, include[]? | r-huijts, DMontgomery40 | include[] supports `syllabus_body`, `term`, `course_progress`, `public_description` |
| canvas_get_course_syllabus | GET /api/v1/courses/:id | course_id | ahnopologetic, DMontgomery40 | convenience wrapper returning `syllabus_body` only |
| canvas_list_sections | GET /api/v1/courses/:id/sections | course_id, include[]? | r-huijts, DMontgomery40 | paginated; include[] supports `students`, `enrollments`, `total_students` |
| canvas_list_enrollments | GET /api/v1/courses/:id/enrollments | course_id, type[]?, state[]?, user_id? | mtgibbs, ahnopologetic | paginated; filter by own user for student use |
| canvas_list_course_tabs | GET /api/v1/courses/:id/tabs | course_id | ahnopologetic | returns visible nav tabs |
| canvas_list_favorite_courses | GET /api/v1/users/self/favorites/courses | — | Kuria-Mbatia, ahnopologetic | |
| canvas_get_dashboard_cards | GET /api/v1/dashboard/dashboard_cards | — | DMontgomery40 | student-oriented dashboard summary |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_course | POST /api/v1/accounts/:account_id/courses | ADMIN |
| canvas_update_course | PUT /api/v1/courses/:id | EDUCATOR |
| canvas_delete_course | DELETE /api/v1/courses/:id | ADMIN |
| canvas_enroll_user | POST /api/v1/courses/:id/enrollments | ADMIN |
| canvas_add_favorite_course | POST /api/v1/users/self/favorites/courses/:id | EDUCATOR |
| canvas_remove_favorite_course | DELETE /api/v1/users/self/favorites/courses/:id | EDUCATOR |

---

## assignments

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_assignments | GET /api/v1/courses/:course_id/assignments | course_id, bucket?, include[]?, search_term?, per_page? | vishalsachdev, r-huijts, DMontgomery40 | paginated; bucket supports `past`, `overdue`, `undated`, `ungraded`, `unsubmitted`, `upcoming`, `future`; include[] supports `submission`, `all_dates`, `overrides` |
| canvas_get_assignment | GET /api/v1/courses/:course_id/assignments/:id | course_id, assignment_id, include[]? | r-huijts, DMontgomery40 | include[] supports `submission`, `rubric`, `assignment_visibility` |
| canvas_list_assignment_groups | GET /api/v1/courses/:course_id/assignment_groups | course_id, include[]? | r-huijts, ahnopologetic, DMontgomery40 | include[] supports `assignments`, `submission` |
| canvas_list_missing_assignments | GET /api/v1/users/self/missing_submissions | course_ids[]?, include[]?, filter[]? | mtgibbs | student-facing; filter[] supports `submittable`, `current_grading_period` |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_assignment | POST /api/v1/courses/:course_id/assignments | EDUCATOR |
| canvas_update_assignment | PUT /api/v1/courses/:course_id/assignments/:id | EDUCATOR |
| canvas_delete_assignment | DELETE /api/v1/courses/:course_id/assignments/:id | EDUCATOR |
| canvas_create_assignment_group | POST /api/v1/courses/:course_id/assignment_groups | EDUCATOR |
| canvas_bulk_update_assignment_dates | PUT /api/v1/courses/:course_id/assignments/bulk_update | EDUCATOR |
| canvas_assign_peer_review | POST /api/v1/courses/:course_id/assignments/:id/peer_reviews | EDUCATOR |

---

## submissions

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_get_my_submission | GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions/self | course_id, assignment_id, include[]? | vishalsachdev, ahnopologetic | include[] supports `submission_comments`, `rubric_assessment`, `submission_history` |
| canvas_list_my_submissions | GET /api/v1/courses/:course_id/students/submissions | course_id, student_ids[]?, workflow_state?, include[]? | ahnopologetic, mtgibbs | defaults `student_ids=[self]`; paginated |
| canvas_get_submission_comments | GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions/:user_id | course_id, assignment_id, user_id? | Kuria-Mbatia, r-huijts | wraps include[]=submission_comments |
| canvas_list_peer_reviews_todo | GET /api/v1/users/self/todo | — | vishalsachdev | filters todo items for `reviewing` type |
| canvas_list_peer_reviews_for_assignment | GET /api/v1/courses/:course_id/assignments/:assignment_id/peer_reviews | course_id, assignment_id, include[]? | vishalsachdev, Kuria-Mbatia | include[] supports `submission_comments`, `user` |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_submit_assignment | POST /api/v1/courses/:course_id/assignments/:id/submissions | ADMIN |
| canvas_grade_submission | PUT /api/v1/courses/:course_id/assignments/:id/submissions/:user_id | EDUCATOR |
| canvas_bulk_grade_submissions | POST /api/v1/courses/:course_id/assignments/:id/submissions/update_grades | EDUCATOR |
| canvas_post_submission_comment | PUT /api/v1/courses/:course_id/assignments/:id/submissions/:user_id (comment[]) | EDUCATOR |
| canvas_list_section_submissions | GET /api/v1/sections/:section_id/students/submissions | EDUCATOR |

---

## grades

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_get_my_grades | GET /api/v1/users/self/enrollments | course_id?, state[]?, limit? | vishalsachdev, DMontgomery40, mtgibbs | returns enrollment objects with current_score, final_score, current_grade, final_grade, and grading-period fields. state defaults to active+invited. limit is client-side |
| canvas_get_assignment_feedback | GET /api/v1/courses/:course_id/assignments/:id/submissions/self | course_id, assignment_id | mtgibbs | wraps grading comments + rubric assessment |
| canvas_get_grading_standards | GET /api/v1/courses/:course_id/grading_standards | course_id | r-huijts | letter-grade thresholds for the course |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_submit_grade | PUT /api/v1/courses/:course_id/assignments/:id/submissions/:user_id | EDUCATOR |
| canvas_get_all_students_status | GET /api/v1/courses/:course_id/students/submissions | EDUCATOR |
| canvas_get_comprehensive_status | (composite grade + submission roll-up) | EDUCATOR |

---

## modules

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_modules | GET /api/v1/courses/:course_id/modules | course_id, include[]?, search_term? | vishalsachdev, r-huijts, DMontgomery40 | paginated; include[] supports `items`, `content_details` |
| canvas_get_module | GET /api/v1/courses/:course_id/modules/:id | course_id, module_id, include[]? | DMontgomery40 | |
| canvas_list_module_items | GET /api/v1/courses/:course_id/modules/:module_id/items | course_id, module_id, include[]? | vishalsachdev, r-huijts, DMontgomery40 | paginated; include[] supports `content_details` |
| canvas_get_module_item | GET /api/v1/courses/:course_id/modules/:module_id/items/:id | course_id, module_id, item_id | DMontgomery40 | |
| canvas_get_module_item_sequence | GET /api/v1/courses/:course_id/module_item_sequence | course_id, asset_type, asset_id | Kuria-Mbatia | next/prev navigation |
| canvas_mark_module_item_read | POST /api/v1/courses/:course_id/modules/:module_id/items/:id/mark_read | course_id, module_id, item_id | Kuria-Mbatia | student progress side-effect, safe |
| canvas_mark_module_item_done | PUT /api/v1/courses/:course_id/modules/:module_id/items/:id/done | course_id, module_id, item_id | DMontgomery40, Kuria-Mbatia | student progress side-effect, safe |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_module | POST /api/v1/courses/:course_id/modules | EDUCATOR |
| canvas_update_module | PUT /api/v1/courses/:course_id/modules/:id | EDUCATOR |
| canvas_delete_module | DELETE /api/v1/courses/:course_id/modules/:id | EDUCATOR |
| canvas_add_module_item | POST /api/v1/courses/:course_id/modules/:module_id/items | EDUCATOR |
| canvas_update_module_item | PUT /api/v1/courses/:course_id/modules/:module_id/items/:id | EDUCATOR |
| canvas_delete_module_item | DELETE /api/v1/courses/:course_id/modules/:module_id/items/:id | EDUCATOR |
| canvas_toggle_module_publish | PUT /api/v1/courses/:course_id/modules/:id | EDUCATOR |

---

## pages

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_pages | GET /api/v1/courses/:course_id/pages | course_id, sort?, search_term?, published? | vishalsachdev, r-huijts, DMontgomery40 | paginated |
| canvas_get_page | GET /api/v1/courses/:course_id/pages/:url_or_id | course_id, page_url_or_id | vishalsachdev, r-huijts, DMontgomery40 | returns `body` HTML |
| canvas_get_front_page | GET /api/v1/courses/:course_id/front_page | course_id | vishalsachdev | |
| canvas_list_page_revisions | GET /api/v1/courses/:course_id/pages/:url_or_id/revisions | course_id, page_url_or_id | r-huijts | paginated |
| canvas_get_page_revision | GET /api/v1/courses/:course_id/pages/:url_or_id/revisions/:revision_id | course_id, page_url_or_id, revision_id, summary? | r-huijts | |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_page | POST /api/v1/courses/:course_id/pages | EDUCATOR |
| canvas_update_page | PUT /api/v1/courses/:course_id/pages/:url_or_id | EDUCATOR |
| canvas_delete_page | DELETE /api/v1/courses/:course_id/pages/:url_or_id | EDUCATOR |
| canvas_revert_page_revision | POST /api/v1/courses/:course_id/pages/:url_or_id/revisions/:revision_id | EDUCATOR |
| canvas_bulk_update_pages | (composite PUT over page list) | EDUCATOR |

---

## calendar

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_calendar_events | GET /api/v1/calendar_events | context_codes[]?, start_date?, end_date?, type? | aryankeluskar, ahnopologetic, DMontgomery40 | paginated; `type` can be `event` or `assignment` |
| canvas_list_upcoming_events | GET /api/v1/users/self/upcoming_events | type?, days?, limit? | DMontgomery40, mtgibbs | canonical "what's coming up" tool. Canvas returns assignments + events merged; type/days/limit are client-side filters |
| canvas_list_planner_items | GET /api/v1/planner/items | start_date?, end_date?, context_codes[]? | ahnopologetic, Kuria-Mbatia | student planner surface |
| canvas_list_todo_items | GET /api/v1/users/self/todo | — | vishalsachdev, mtgibbs | todo entries: grading, submitting, reviewing |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_calendar_event | POST /api/v1/calendar_events | EDUCATOR |
| canvas_update_calendar_event | PUT /api/v1/calendar_events/:id | EDUCATOR |
| canvas_delete_calendar_event | DELETE /api/v1/calendar_events/:id | EDUCATOR |
| canvas_create_planner_note | POST /api/v1/planner_notes | EDUCATOR |
| canvas_update_planner_note | PUT /api/v1/planner_notes/:id | EDUCATOR |
| canvas_delete_planner_note | DELETE /api/v1/planner_notes/:id | EDUCATOR |
| canvas_mark_planner_item_complete | PUT /api/v1/planner/overrides/:id | EDUCATOR |

---

## announcements

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_announcements | GET /api/v1/announcements | context_codes[], start_date?, end_date?, active_only? | vishalsachdev, DMontgomery40, mtgibbs | `context_codes[]` required, e.g. `course_123`; paginated |
| canvas_list_course_announcements | GET /api/v1/courses/:course_id/discussion_topics?only_announcements=true | course_id, per_page? | vishalsachdev | paginated |
| canvas_get_announcement | GET /api/v1/courses/:course_id/discussion_topics/:topic_id | course_id, announcement_id | vishalsachdev | announcements are discussion topics with `is_announcement=true` |
| canvas_list_account_notifications | GET /api/v1/accounts/self/account_notifications | — | Kuria-Mbatia | global institution-wide notices |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_announcement | POST /api/v1/courses/:course_id/discussion_topics | EDUCATOR |
| canvas_delete_announcement | DELETE /api/v1/courses/:course_id/discussion_topics/:id | EDUCATOR |
| canvas_bulk_delete_announcements | (composite) | EDUCATOR |

---

## discussions

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_discussion_topics | GET /api/v1/courses/:course_id/discussion_topics | course_id, only_announcements?, search_term?, include[]? | vishalsachdev, r-huijts, DMontgomery40 | paginated |
| canvas_get_discussion_topic | GET /api/v1/courses/:course_id/discussion_topics/:topic_id | course_id, topic_id, include[]? | vishalsachdev, DMontgomery40 | |
| canvas_get_discussion_view | GET /api/v1/courses/:course_id/discussion_topics/:topic_id/view | course_id, topic_id | ahnopologetic, Kuria-Mbatia | full threaded view with replies |
| canvas_list_discussion_entries | GET /api/v1/courses/:course_id/discussion_topics/:topic_id/entries | course_id, topic_id | vishalsachdev | paginated |
| canvas_get_discussion_entry | GET /api/v1/courses/:course_id/discussion_topics/:topic_id/entries/:entry_id | course_id, topic_id, entry_id | vishalsachdev | |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_discussion_topic | POST /api/v1/courses/:course_id/discussion_topics | EDUCATOR |
| canvas_post_discussion_entry | POST /api/v1/courses/:course_id/discussion_topics/:topic_id/entries | EDUCATOR |
| canvas_reply_to_discussion_entry | POST /api/v1/courses/:course_id/discussion_topics/:topic_id/entries/:entry_id/replies | EDUCATOR |
| canvas_delete_discussion_topic | DELETE /api/v1/courses/:course_id/discussion_topics/:id | EDUCATOR |

---

## files

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_course_files | GET /api/v1/courses/:course_id/files | course_id, search_term?, content_types[]?, sort? | vishalsachdev, ahnopologetic, DMontgomery40 | paginated |
| canvas_list_folders | GET /api/v1/courses/:course_id/folders | course_id | DMontgomery40 | paginated |
| canvas_list_folder_files | GET /api/v1/folders/:folder_id/files | folder_id | DMontgomery40 | paginated |
| canvas_get_file | GET /api/v1/files/:id | file_id, include[]? | ahnopologetic, DMontgomery40 | include[] supports `user`, `usage_rights` |
| canvas_get_file_download_url | GET /api/v1/files/:id | file_id | aryankeluskar, Kuria-Mbatia | returns pre-authenticated `url` field for client download |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_upload_file | POST /api/v1/courses/:course_id/files (3-step flow) | ADMIN |
| canvas_delete_file | DELETE /api/v1/files/:id | EDUCATOR |
| canvas_download_file_to_disk | (server-side download, not student-safe) | ADMIN |

---

## messages

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_conversations | GET /api/v1/conversations | scope?, filter[]?, include[]? | vishalsachdev, mtgibbs, DMontgomery40 | paginated; scope supports `unread`, `starred`, `archived`, `sent` |
| canvas_get_conversation | GET /api/v1/conversations/:id | conversation_id, include[]? | vishalsachdev, DMontgomery40 | include[] supports `participant_avatars` |
| canvas_get_unread_count | GET /api/v1/conversations/unread_count | — | vishalsachdev, mtgibbs | |
| canvas_mark_conversation_read | PUT /api/v1/conversations/:id | conversation_id, workflow_state? | vishalsachdev | safe self-state toggle; `workflow_state=read` |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_send_conversation | POST /api/v1/conversations | EDUCATOR |
| canvas_reply_to_conversation | POST /api/v1/conversations/:id/add_message | EDUCATOR |
| canvas_send_bulk_messages | POST /api/v1/conversations (recipients[]) | EDUCATOR |
| canvas_delete_conversation | DELETE /api/v1/conversations/:id | EDUCATOR |

---

## notifications

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_account_notifications | GET /api/v1/accounts/self/account_notifications | — | Kuria-Mbatia | institutional banners |
| canvas_list_activity_stream | GET /api/v1/users/self/activity_stream | only_active_courses? | DMontgomery40, Kuria-Mbatia | paginated; consolidates announcements, discussions, submissions, conversations |
| canvas_get_activity_stream_summary | GET /api/v1/users/self/activity_stream/summary | — | DMontgomery40 | counts by category |
| canvas_list_communication_channels | GET /api/v1/users/self/communication_channels | — | DMontgomery40 | returns email/push channels (used to interpret notification preferences) |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_dismiss_account_notification | DELETE /api/v1/accounts/self/account_notifications/:id | EDUCATOR |
| canvas_update_notification_preference | PUT /api/v1/users/self/communication_channels/:id/notification_preferences/:notification | EDUCATOR |

---

## profile

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_get_my_profile | GET /api/v1/users/self/profile | — | DMontgomery40, r-huijts, ahnopologetic | |
| canvas_get_user_profile | GET /api/v1/users/:user_id/profile | user_id | DMontgomery40 | student can fetch visible profiles in shared courses |
| canvas_get_my_settings | GET /api/v1/users/self/settings | — | DMontgomery40 | |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_update_user_profile | PUT /api/v1/users/:id | EDUCATOR |
| canvas_update_my_settings | PUT /api/v1/users/self/settings | EDUCATOR |
| canvas_create_user | POST /api/v1/accounts/:account_id/users | ADMIN |

---

## quizzes

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_quizzes | GET /api/v1/courses/:course_id/quizzes | course_id, search_term? | r-huijts, ahnopologetic, DMontgomery40 | paginated |
| canvas_get_quiz | GET /api/v1/courses/:course_id/quizzes/:id | course_id, quiz_id | r-huijts, ahnopologetic, DMontgomery40 | |
| canvas_list_my_quiz_submissions | GET /api/v1/courses/:course_id/quizzes/:quiz_id/submissions | course_id, quiz_id | DMontgomery40 | filters by self; includes score/attempts |
| canvas_get_my_quiz_submission | GET /api/v1/courses/:course_id/quizzes/:quiz_id/submissions/self | course_id, quiz_id | DMontgomery40 | |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_quiz | POST /api/v1/courses/:course_id/quizzes | EDUCATOR |
| canvas_update_quiz | PUT /api/v1/courses/:course_id/quizzes/:id | EDUCATOR |
| canvas_delete_quiz | DELETE /api/v1/courses/:course_id/quizzes/:id | EDUCATOR |
| canvas_list_quiz_questions | GET /api/v1/courses/:course_id/quizzes/:quiz_id/questions | EDUCATOR |
| canvas_create_quiz_question | POST /api/v1/courses/:course_id/quizzes/:quiz_id/questions | EDUCATOR |
| canvas_update_quiz_question | PUT /api/v1/courses/:course_id/quizzes/:quiz_id/questions/:id | EDUCATOR |
| canvas_delete_quiz_question | DELETE /api/v1/courses/:course_id/quizzes/:quiz_id/questions/:id | EDUCATOR |
| canvas_list_quiz_question_groups | GET /api/v1/courses/:course_id/quizzes/:quiz_id/groups | EDUCATOR |
| canvas_start_quiz_attempt | POST /api/v1/courses/:course_id/quizzes/:quiz_id/submissions | ADMIN |

---

## rubrics

| Tool | Endpoint | Inputs | Sources | Notes |
|------|----------|--------|---------|-------|
| canvas_list_rubrics | GET /api/v1/courses/:course_id/rubrics | course_id, include[]? | vishalsachdev, r-huijts, DMontgomery40 | paginated; include[] supports `associations`, `assessments` |
| canvas_get_rubric | GET /api/v1/courses/:course_id/rubrics/:id | course_id, rubric_id, include[]?, style? | vishalsachdev, r-huijts, DMontgomery40 | include[] supports `assessments`, `graded_assessments`, `peer_assessments`; `style` = `full` or `comments_only` |
| canvas_get_rubric_statistics | GET /api/v1/courses/:course_id/rubrics/:id (include[]=assessments) | course_id, rubric_id | r-huijts | computed client-side from assessments |
| canvas_get_my_rubric_assessment | GET /api/v1/courses/:course_id/assignments/:assignment_id/submissions/self (include[]=rubric_assessment) | course_id, assignment_id | vishalsachdev | student's own rubric scoring for an assignment |

### Admin / educator (commented out in code)

| Tool | Endpoint | Marker |
|------|----------|--------|
| canvas_create_rubric | POST /api/v1/courses/:course_id/rubrics | EDUCATOR |
| canvas_update_rubric | PUT /api/v1/courses/:course_id/rubrics/:id | EDUCATOR |
| canvas_delete_rubric | DELETE /api/v1/courses/:course_id/rubrics/:id | EDUCATOR |
| canvas_associate_rubric | POST /api/v1/courses/:course_id/rubric_associations | EDUCATOR |
| canvas_grade_with_rubric | PUT /api/v1/courses/:course_id/assignments/:id/submissions/:user_id (rubric_assessment) | EDUCATOR |
