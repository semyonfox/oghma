# Attribution

canvas-mcp merges ideas and tool designs from the following open-source Canvas MCP servers. All are MIT or ISC licensed. Deep thanks to every author — this project stands on their work.

## Source repositories

| Repo | Author | License | Link |
|------|--------|---------|------|
| canvas-mcp | Vishal Sachdev | MIT | https://github.com/vishalsachdev/canvas-mcp |
| mcp-canvas-lms | DMontgomery40 | MIT | https://github.com/DMontgomery40/mcp-canvas-lms |
| canvas-mcp | R. Huijts | MIT | https://github.com/r-huijts/canvas-mcp |
| canvas-lms-mcp | Matt Gibbs (mtgibbs) | MIT | https://github.com/mtgibbs/canvas-lms-mcp |
| canvas-lms-mcp | ahnopologetic | MIT | https://github.com/ahnopologetic/canvas-lms-mcp |
| canvas-mcp | Aryan Keluskar | ISC | https://github.com/aryankeluskar/canvas-mcp |
| canvas-mcp | a-ariff | MIT | https://github.com/a-ariff/canvas-mcp |
| canvas-lms-mcp | sweeden-ttu | MIT | https://github.com/sweeden-ttu/canvas-lms-mcp |
| canvas-student-mcp | Jon-Vii | (see upstream repo) | https://github.com/Jon-Vii/canvas-student-mcp |
| Canvas-MCP-server | Kuria Mbatia (Notioc) | MIT | https://github.com/Kuria-Mbatia/Canvas-MCP-server |
| mcp-server-canvas | enkhbold470 | (declared MIT in package metadata) | https://github.com/enkhbold470/mcp-server-canvas |
| poke-canvas-mcp | Shashwat Mishra | MIT | https://github.com/Shashwatpog/poke-canvas-mcp |

## Per-domain sources

**Courses.** Core list/get shape from `vishalsachdev`, `r-huijts`, and `DMontgomery40`. Section and enrollment handling borrowed from `DMontgomery40` and `mtgibbs`. Favorite-course and dashboard-card conveniences come from `Kuria-Mbatia` and `ahnopologetic`.

**Assignments.** Based primarily on `vishalsachdev`, `r-huijts`, and `DMontgomery40`, which between them cover bucket filtering, `include[]=submission`, and per-course pagination. Student-centric upcoming/missing/due-this-week tools come from `mtgibbs`.

**Submissions.** Student-self submission shape from `ahnopologetic` and `vishalsachdev`. Rich include[] handling and comment/rubric merging patterns from `r-huijts` and `Kuria-Mbatia`. Peer-review surfacing from `vishalsachdev`.

**Grades.** Enrollment-derived grade tools from `DMontgomery40` and `vishalsachdev`. Recent-grades and feedback roll-ups from `mtgibbs`. Grading-standard lookup from `r-huijts`.

**Modules.** List/get shape from `vishalsachdev`, `r-huijts`, and `DMontgomery40`. Student progress endpoints (mark_read, mark_done, item sequence) from `Kuria-Mbatia` and `DMontgomery40`.

**Pages.** Base list/get/front-page from `vishalsachdev` and `DMontgomery40`. Revision browsing and the page-revision payload handling come almost entirely from `r-huijts`.

**Calendar.** `aryankeluskar` and `ahnopologetic` provide the core calendar-event query shape with context-code filtering. Planner and todo surfaces from `ahnopologetic`, `Kuria-Mbatia`, `mtgibbs`, and `vishalsachdev`.

**Announcements.** Institution-wide `/announcements` endpoint from `vishalsachdev`, `DMontgomery40`, and `mtgibbs`. Per-course announcement filtering (via `discussion_topics?only_announcements=true`) from `vishalsachdev`. Account notification banners from `Kuria-Mbatia`.

**Discussions.** Topic list/get from `vishalsachdev`, `r-huijts`, and `DMontgomery40`. Threaded `view` endpoint and replies walk from `ahnopologetic` and `Kuria-Mbatia`. Entry-level tools from `vishalsachdev`.

**Files.** Course file listing and folder traversal from `DMontgomery40`, `ahnopologetic`, and `vishalsachdev`. Pre-authenticated download-URL pattern from `aryankeluskar` and `Kuria-Mbatia` — this is the student-safe way to hand a file to the client without the server streaming bytes.

**Messages.** Conversations/inbox shape from `vishalsachdev`, `mtgibbs`, and `DMontgomery40`. Unread-count tool and workflow_state toggling from `vishalsachdev` and `mtgibbs`.

**Notifications.** Activity stream surface from `DMontgomery40` and `Kuria-Mbatia`. Account notifications and communication-channel listing from `DMontgomery40` and `Kuria-Mbatia`.

**Profile.** Self-profile and user-settings endpoints from `DMontgomery40`, `r-huijts`, and `ahnopologetic`.

**Quizzes.** List/get shape from `r-huijts`, `ahnopologetic`, and `DMontgomery40`. Student-self quiz submission retrieval from `DMontgomery40`. `r-huijts` also contributes the large commented-out educator surface (question CRUD, question groups).

**Rubrics.** Base list/get and statistics from `vishalsachdev`, `r-huijts`, and `DMontgomery40`. Student-scoped rubric-assessment retrieval (via submissions include[]) from `vishalsachdev`.
