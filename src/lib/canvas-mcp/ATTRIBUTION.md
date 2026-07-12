# Attribution

> Status: Active provenance record; not a legal opinion
>
> Audience: Maintainers and redistribution reviewers
>
> Last reviewed: 2026-07-11

`canvas-mcp` combines ideas and tool designs observed in the projects below.
This file records known influence; it does not establish that every copied or
adapted element is license-compatible.

Most recorded labels are MIT or ISC, but upstream revisions were not pinned in
the original synthesis and two labels remain based on incomplete evidence.
Before redistribution, review the actual upstream `LICENSE` file and copyright
notice at the revision that informed the code. Preserve required notices and
record the reviewed revision here.

## Source repositories

| Repo | Author | Recorded license label | Link |
|------|--------|---------|------|
| canvas-mcp | Vishal Sachdev | MIT | https://github.com/vishalsachdev/canvas-mcp |
| mcp-canvas-lms | DMontgomery40 | MIT | https://github.com/DMontgomery40/mcp-canvas-lms |
| canvas-mcp | R. Huijts | MIT | https://github.com/r-huijts/canvas-mcp |
| canvas-lms-mcp | Matt Gibbs (mtgibbs) | MIT | https://github.com/mtgibbs/canvas-lms-mcp |
| canvas-lms-mcp | ahnopologetic | MIT | https://github.com/ahnopologetic/canvas-lms-mcp |
| canvas-mcp | Aryan Keluskar | ISC | https://github.com/aryankeluskar/canvas-mcp |
| canvas-mcp | a-ariff | MIT | https://github.com/a-ariff/canvas-mcp |
| canvas-lms-mcp | sweeden-ttu | MIT | https://github.com/sweeden-ttu/canvas-lms-mcp |
| canvas-student-mcp | Jon-Vii | Unverified in this record | https://github.com/Jon-Vii/canvas-student-mcp |
| Canvas-MCP-server | Kuria Mbatia (Notioc) | MIT | https://github.com/Kuria-Mbatia/Canvas-MCP-server |
| mcp-server-canvas | enkhbold470 | MIT in package metadata; upstream license file not verified here | https://github.com/enkhbold470/mcp-server-canvas |
| poke-canvas-mcp | Shashwat Mishra | MIT | https://github.com/Shashwatpog/poke-canvas-mcp |

The local `LICENSE` file is a separate legal artifact and has not been rewritten
as part of documentation cleanup. Its upstream assertions should be reconciled
only after the provenance review above.

## Per-domain sources

These associations come from the original reference sweep. Revisions and
file-level evidence were not preserved, so they are provenance leads rather
than proof that a particular current line was copied.

**Courses.** Core list/get shape from `vishalsachdev`, `r-huijts`, and `DMontgomery40`. Section and enrollment handling borrowed from `DMontgomery40` and `mtgibbs`. Favorite-course and dashboard-card conveniences come from `Kuria-Mbatia` and `ahnopologetic`.

**Assignments.** Based primarily on `vishalsachdev`, `r-huijts`, and `DMontgomery40`, which between them cover bucket filtering, `include[]=submission`, and per-course pagination. Student-centric upcoming/missing/due-this-week tools come from `mtgibbs`.

**Submissions.** Student-self submission shape from `ahnopologetic` and `vishalsachdev`. Rich include[] handling and comment/rubric merging patterns from `r-huijts` and `Kuria-Mbatia`. Peer-review surfacing from `vishalsachdev`.

**Grades.** Enrollment-derived grade tools from `DMontgomery40` and `vishalsachdev`. Recent-grades and feedback roll-ups from `mtgibbs`. Grading-standard lookup from `r-huijts`.

**Modules.** List/get shape from `vishalsachdev`, `r-huijts`, and `DMontgomery40`. Student progress endpoints (mark_read, mark_done, item sequence) from `Kuria-Mbatia` and `DMontgomery40`.

**Pages.** Base list/get/front-page from `vishalsachdev` and `DMontgomery40`. Revision browsing and the page-revision payload handling come almost entirely from `r-huijts`.

**Calendar.** `aryankeluskar` and `ahnopologetic` provide the core calendar-event query shape with context-code filtering. Planner and todo surfaces from `ahnopologetic`, `Kuria-Mbatia`, `mtgibbs`, and `vishalsachdev`.

**Announcements.** Institution-wide `/announcements` endpoint from `vishalsachdev`, `DMontgomery40`, and `mtgibbs`. Per-course announcement filtering (via `discussion_topics?only_announcements=true`) from `vishalsachdev`. Account notification banners from `Kuria-Mbatia`.

**Discussions.** Topic list/get from `vishalsachdev`, `r-huijts`, and `DMontgomery40`. Threaded `view` endpoint and replies walk from `ahnopologetic` and `Kuria-Mbatia`. Entry-level tools from `vishalsachdev`.

**Files.** Course file listing and folder traversal were associated with `DMontgomery40`, `ahnopologetic`, and `vishalsachdev`. The pre-authenticated download-URL pattern was associated with `aryankeluskar` and `Kuria-Mbatia`. Returning a URL avoids a server-side write, but the URL remains a sensitive bearer capability until it expires.

**Messages.** Conversations/inbox shape from `vishalsachdev`, `mtgibbs`, and `DMontgomery40`. Unread-count tool and workflow_state toggling from `vishalsachdev` and `mtgibbs`.

**Notifications.** Activity stream surface from `DMontgomery40` and `Kuria-Mbatia`. Account notifications and communication-channel listing from `DMontgomery40` and `Kuria-Mbatia`.

**Profile.** Self-profile and user-settings endpoints from `DMontgomery40`, `r-huijts`, and `ahnopologetic`.

**Quizzes.** List/get shape was associated with `r-huijts`, `ahnopologetic`, and `DMontgomery40`; student-self quiz submission retrieval was associated with `DMontgomery40`. The educator question and group tools are registered in the current package, not commented out.

**Rubrics.** Base list/get and statistics from `vishalsachdev`, `r-huijts`, and `DMontgomery40`. Student-scoped rubric-assessment retrieval (via submissions include[]) from `vishalsachdev`.
