# Project Planning

**Central project plan for SocsBoard development**

Single source of truth for timeline, assignments, and sprint breakdown.

Last Updated: February 12, 2026

---

## Technical Decisions

### Package Manager: npm (not pnpm)

**Decision:** Use npm exclusively for this project

**Rationale:**
- AWS Amplify has better native support for npm
- Simpler deployment configuration (no pnpm installation step)
- Easier for team members unfamiliar with pnpm
- Slightly slower install times acceptable for deployment ease

**Trade-offs:**
- npm is slower than pnpm for local development
- npm uses more disk space (no content-addressable storage)
- Accepted for improved AWS compatibility and deployment simplicity

---

## Overview

**Timeline:** 8 weeks (February 5 - April 2, 2026)
**Team Size:** 4 people (3 developers + 1 scrum master/coordinator)
**Module:** CT216 Software Engineering I
**Weighting:** 40% of module grade

---

## Sprint Timeline

### Phase 1: Foundation (Weeks 1-2)
**Focus:** Events system
**Status:** In progress

### Phase 2: Social (Weeks 3-4)
**Focus:** Societies and posts
**Status:** Pending

### Phase 3: Recommendations (Weeks 5-6)
**Focus:** Personalized discovery
**Status:** Pending

### Phase 4: Polish (Weeks 7-8)
**Focus:** Multilingual support, testing, deployment
**Status:** Pending

---

## Phase 1: Events System (Weeks 1-2)

### Epic 2: Event Discovery & Management

**Primary developer:** Person B
**Database owner:** Person A

#### 2.1 Browse Events
- **Story:** GET /api/events endpoint
- **Features:** List, filter by category/society, search, pagination
- **Spec:** docs/API_SPECS.md (Events API section)
- **Status:** Ready to build
- **Definition of Done:**
  - Endpoint returns paginated event list
  - Filters work (category, society_id, search)
  - Code passes linting
  - PR approved

#### 2.2 View Event Details
- **Story:** GET /api/events/:id endpoint
- **Features:** Full event info, society name, registered count
- **Database:** Query from events table
- **Status:** Blocked on 2.1

#### 2.3 Register for Event
- **Story:** POST /api/events/:id/register endpoint
- **Features:** Register user, handle waitlist if full, duplicate check
- **Database:** Insert into event_registrations table
- **Status:** Blocked on database schema

#### 2.4 Create Event (Admin)
- **Story:** POST /api/events endpoint
- **Features:** Society admin creates events, validation, draft/publish
- **Auth:** Check user is society admin
- **Status:** Blocked on 2.1

#### 2.5 Edit/Delete Event
- **Story:** PUT/DELETE /api/events/:id endpoints
- **Features:** Update event, cancel (notify registrants)
- **Auth:** Only creator/society admin
- **Status:** Blocked on 2.4

#### 2.6 Calendar Integration
- **Story:** Export events to .ics format
- **Features:** Add to calendar button, iCalendar format
- **Status:** Week 2, after core endpoints work

### Week 1 Success Metrics
- Events database schema created
- POST /api/events working
- GET /api/events working
- Person B submits first PR

### Week 2 Success Metrics
- Event registration endpoints working
- Edit/delete events working
- All Events epic complete

---

## Phase 2: Societies & Posts (Weeks 3-4)

### Epic 3: Social Posts & Society Interaction

**Primary developer:** Person C
**Database:** Person A continues

#### 3.1 Create Social Post
- **Story:** POST /api/posts endpoint
- **Features:** Text + image, society posts only
- **Database:** posts table
- **Status:** Week 3

#### 3.2 View Social Feed
- **Story:** GET /api/posts endpoint
- **Features:** Feed from followed societies, pagination
- **Database:** Query posts with society info
- **Status:** Week 3, after posts table

#### 3.3 Interact with Posts
- **Story:** POST /api/posts/:id/like, POST /api/posts/:id/ignore
- **Features:** Like/unlike, mark not interested
- **Database:** interactions table
- **Status:** Week 3

#### 3.4 Follow/Unfollow Society
- **Story:** POST /api/societies/:id/follow endpoints
- **Features:** Follow/unfollow, list followed societies
- **Database:** followers table
- **Status:** Week 3

### Epic 6: Society Dashboard & Analytics

#### 6.1 Society Dashboard
- **Story:** GET /api/societies/:id/dashboard endpoint
- **Features:** Events, posts, followers, quick actions
- **Status:** Week 4

#### 6.2 Engagement Analytics
- **Story:** GET /api/societies/:id/analytics endpoint
- **Features:** Registration trends, post engagement, demographics
- **Status:** Week 4

### Week 4 Success Metrics
- Societies profiles + following complete
- Social posts + feed working
- All Post/Society epics complete

---

## Phase 3: Recommendations (Weeks 5-6)

### Epic 4: Personalized Recommendations

**Primary developer:** Person B or Person C
**Algorithm:** Python backend (separate service)

#### 4.1 Receive Event Recommendations
- **Story:** GET /api/recommendations/events endpoint
- **Features:** Ranked events based on user profile
- **Algorithm:** Score = (society_membership * 0.4) + (category_match * 0.3) + (attendance_history * 0.3)
- **Status:** Week 5

#### 4.2 Recommendation Feedback
- **Story:** POST /api/recommendations/:id/feedback endpoint
- **Features:** Mark "interested" / "not interested", improve algorithm
- **Status:** Week 5

### Week 6 Success Metrics
- Recommendation algorithm working
- Events ranked by relevance
- All Recommendation epic complete

---

## Phase 4: Polish (Weeks 7-8)

### Epic 5: Multilingual Support

**Primary:** Anyone (relatively isolated)

#### 5.1 Switch Language
- **Story:** Language selector in UI (English/Irish)
- **Features:** next-intl setup, URL-based locales
- **Status:** Week 7

#### 5.2 Create Multilingual Content
- **Story:** Event/post creation supports both languages
- **Features:** Manual translation only
- **Status:** Week 7

#### 5.3 Translate Content
- **Story:** UI translations complete
- **Features:** All pages in English + Irish
- **Status:** Week 7

### Epic 7: Administrative Functions

#### 7.1 Moderate Content
- **Story:** Admin panel for content moderation
- **Features:** Report/remove posts, ban users
- **Status:** Week 8 (if time)

#### 7.2 View Platform Analytics
- **Story:** Super admin dashboard
- **Features:** Total users, events, posts, trends
- **Status:** Week 8 (if time)

### Week 8 Success Metrics
- All core features complete
- Tests passing
- Deployed to production
- Demo prepared

---

## Team Assignments

| Person | Weeks 1-2 | Weeks 3-4 | Weeks 5-6 | Weeks 7-8 |
|--------|-----------|-----------|-----------|-----------|
| **Person A** (DB) | Events schema + queries | Societies/posts tables | Optimize performance | Deploy, monitoring |
| **Person B** (API) | Events endpoints | Recommendations | Polish + testing | Demo, final fixes |
| **Person C** (Features) | Help Person B | Societies + posts | Multilingual setup | Testing, docs |
| **Scrum Master** | Coordination | Coordination | Coordination | Final review |

---

## Tech Lead Responsibilities

### Semyon's Weekly Tasks

#### Week 1
- Events API specification
- Code standards + PR template
- GitHub Actions linting
- Assign work to team members
- Daily code reviews (30 min max)

#### Week 2
- Development patterns guide
- Database schema specs
- Review PRs from Person B
- Unblock team if stuck

#### Weeks 3-4
- Societies API specification
- Posts API specification
- Review code
- Adjust sprint if needed

#### Weeks 5-6
- Recommendations algorithm spec
- Review code
- Integration testing

#### Weeks 7-8
- Deployment guide
- Final documentation
- Demo prep
- Bug fixes

---

## Critical Path

### Blocking Dependencies

1. **Events database schema** (blocks all event endpoints)
2. **Events endpoints** (blocks registration, edit, delete)
3. **Societies/followers** (blocks social feed, recommendations)
4. **Recommendation algorithm** (blocks personalized discovery)
5. **Multilingual** (blocks final UI polish)

### Cannot Parallelize
Events → Societies → Recommendations

### Can Parallelize
Database work (Person A) + Endpoint work (Person B/C)

---

## Priority Adjustment

### If Behind Schedule

**Must-have (MVP):**
1. Events (create, list, register)
2. Societies (profiles, following)
3. Basic recommendations (simple scoring)
4. Responsive UI

**Nice-to-have (cut if needed):**
- Analytics dashboard
- Admin moderation
- Calendar integration
- Multilingual (English-only MVP)
- Advanced recommendations

**Stretch (only if ahead):**
- Push notifications
- Advanced search
- Student data API integration
- Python recommender rewrite

---

## Jira Epic Mapping

| Epic | Weeks | Status |
|------|-------|--------|
| 1: Authentication | 1 (done) | Complete |
| 2: Event Discovery | 1-2 | In Progress |
| 3: Social Posts | 3-4 | Pending |
| 4: Recommendations | 5-6 | Pending |
| 5: Multilingual | 7 | Pending |
| 6: Society Dashboard | 4 | Pending |
| 7: Admin Functions | 8 | Pending (if time) |

---

## Key Reference Documents

**Active Development:**
- docs/API_SPECS.md - All endpoint specifications
- docs/DEVELOPMENT_PATTERNS.md - Code patterns to follow
- docs/REQUIREMENTS.md - Full SRS
- TODO.md - Active blockers and tasks

**Archived Planning:**
- .archive/2025-02-06-REMEDIATION_ACTION_ITEMS.md - Completed security fixes
- .archive/2025-02-05-TEAM_KICKOFF.md - Initial kickoff guide
- .archive/2025-02-05-SEMYON_TASKS.md - Original tech lead tasks

---

## Active Blockers

See TODO.md for current blockers and implementation tasks.

---

**Owner:** Semyon (Tech Lead)
**Status:** Active - Week 1 in progress
