# SocsBoard - Central Project Plan

**Single source of truth** for what we're building, when, and who owns it.

**Timeline:** 8 weeks (Feb 5 - Apr 2, 2026)
**Team:** 4 people (3 developers + 1 scrum master/coord)

---

## PHASE 1: FOUNDATION (Weeks 1-2)

### Blocking Issues (Must Complete First)

**Status:** ✅ DONE
- [x] Missing `/api/auth/logout` endpoint
- [x] Missing `/api/auth/me` endpoint
- [x] Rate limiting on login (5 attempts/15 min)
- [x] Account lockout (30 min after max attempts)
- [x] Code standards + PR template
- [x] GitHub Actions linting

---

## PHASE 2: EVENTS SYSTEM (Weeks 1-2)

**Epic 2: Event Discovery & Management**

Primary developer: **Person B**
Database owner: **Person A**

### 2.1 Browse Events
- **Story:** GET /api/events endpoint
- **Features:** List, filter by category/society, search, pagination
- **Spec:** `docs/API_SPECS.md` (Events API section)
- **Status:** Ready to build
- **Definition of Done:**
  - Endpoint returns paginated event list
  - Filters work (category, society_id, search)
  - Code passes linting
  - PR approved

### 2.2 View Event Details
- **Story:** GET /api/events/:id endpoint
- **Features:** Full event info, society name, registered count
- **Database:** Query from events table
- **Status:** Blocked on 2.1

### 2.3 Register for Event
- **Story:** POST /api/events/:id/register endpoint
- **Features:** Register user, handle waitlist if full, duplicate check
- **Database:** Insert into event_registrations table
- **Status:** Blocked on database schema

### 2.4 Create Event (Admin)
- **Story:** POST /api/events endpoint
- **Features:** Society admin creates events, validation, draft/publish
- **Auth:** Check user is society admin
- **Status:** Blocked on 2.1

### 2.5 Edit/Delete Event
- **Story:** PUT/DELETE /api/events/:id endpoints
- **Features:** Update event, cancel (notify registrants)
- **Auth:** Only creator/society admin
- **Status:** Blocked on 2.4

### 2.6 Calendar Integration
- **Story:** Export events to .ics format
- **Features:** Add to calendar button, iCalendar format
- **Status:** Week 2, after core endpoints work

---

## PHASE 3: SOCIETIES & POSTS (Weeks 3-4)

**Epic 3: Social Posts & Society Interaction**
**Epic 6: Society Dashboard & Analytics**

Primary developer: **Person C**
Database: **Person A** continues

### 3.1 Create Social Post
- **Story:** POST /api/posts endpoint
- **Features:** Text + image, society posts only
- **Database:** posts table
- **Status:** Week 3

### 3.2 View Social Feed
- **Story:** GET /api/posts endpoint
- **Features:** Feed from followed societies, pagination
- **Database:** Query posts with society info
- **Status:** Week 3, after posts table

### 3.3 Interact with Posts
- **Story:** POST /api/posts/:id/like, POST /api/posts/:id/ignore
- **Features:** Like/unlike, mark not interested
- **Database:** interactions table
- **Status:** Week 3

### 3.4 Follow/Unfollow Society
- **Story:** POST /api/societies/:id/follow endpoints
- **Features:** Follow/unfollow, list followed societies
- **Database:** followers table
- **Status:** Week 3

### 6.1 Society Dashboard
- **Story:** GET /api/societies/:id/dashboard endpoint
- **Features:** Events, posts, followers, quick actions
- **Status:** Week 4

### 6.2 Engagement Analytics
- **Story:** GET /api/societies/:id/analytics endpoint
- **Features:** Registration trends, post engagement, demographics
- **Status:** Week 4

---

## PHASE 4: RECOMMENDATIONS (Weeks 5-6)

**Epic 4: Personalized Recommendations**

Primary developer: **Person B** or **Person C**
Algorithm: Python backend (apps/recommender/)

### 4.1 Receive Event Recommendations
- **Story:** GET /api/recommendations/events endpoint
- **Features:** Ranked events based on user profile
- **Algorithm:** Score = (society_membership * 0.4) + (category_match * 0.3) + (attendance_history * 0.3)
- **Status:** Week 5

### 4.2 Recommendation Feedback
- **Story:** POST /api/recommendations/:id/feedback endpoint
- **Features:** Mark "interested" / "not interested", improve algorithm
- **Status:** Week 5

---

## PHASE 5: MULTILINGUAL SUPPORT (Week 7)

**Epic 5: Multilingual Support**

Primary: **Anyone** (relatively isolated)

### 5.1 Switch Language
- **Story:** Language selector in UI (English/Irish)
- **Features:** next-intl setup, URL-based locales
- **Status:** Week 7

### 5.2 Create Multilingual Content
- **Story:** Event/post creation supports both languages
- **Features:** Manual translation only (no DeepL)
- **Status:** Week 7

### 5.3 Translate Content
- **Story:** UI translations complete
- **Features:** All pages in English + Irish
- **Status:** Week 7

---

## PHASE 6: ADMIN & POLISH (Week 8)

**Epic 7: Administrative Functions**

### 7.1 Moderate Content
- **Story:** Admin panel for content moderation
- **Features:** Report/remove posts, ban users
- **Status:** Week 8 (if time)

### 7.2 View Platform Analytics
- **Story:** Super admin dashboard
- **Features:** Total users, events, posts, trends
- **Status:** Week 8 (if time)

---

## TECH LEAD RESPONSIBILITIES (Semyon)

### Week 1
- [x] Events API specification
- [x] Code standards + PR template
- [x] GitHub Actions linting
- [ ] Assign work to team members
- [ ] Daily code reviews (30 min max)

### Week 2
- [ ] Development patterns guide (how to structure endpoints)
- [ ] Database schema specs (for Person A)
- [ ] Review PRs from Person B
- [ ] Unblock team if stuck

### Weeks 3-4
- [ ] Societies API specification
- [ ] Posts API specification
- [ ] Review code
- [ ] Adjust sprint if needed

### Weeks 5-6
- [ ] Recommendations algorithm spec
- [ ] Review code
- [ ] Integration testing

### Week 7-8
- [ ] Deployment guide
- [ ] Final documentation
- [ ] Demo prep
- [ ] Bug fixes

---

## TEAM ASSIGNMENTS

| Person | Weeks 1-2 | Weeks 3-4 | Weeks 5-6 | Weeks 7-8 |
|--------|-----------|-----------|-----------|-----------|
| **Person A** (DB) | Events schema + queries | Societies/posts tables | Optimize performance | Deploy, monitoring |
| **Person B** (API) | Events endpoints | Recommendations | Polish + testing | Demo, final fixes |
| **Person C** (Features) | Help Person B | Societies + posts | Multilingual setup | Testing, docs |
| **Scrum Master** | ? | ? | ? | ? |

---

## SUCCESS METRICS

### Week 1 (by Friday)
- [ ] Events database schema created
- [ ] POST /api/events working
- [ ] GET /api/events working
- [ ] Person B submits first PR

### Week 2
- [ ] Event registration endpoints working
- [ ] Edit/delete events working
- [ ] All Events epic complete

### Week 4 (Societies done)
- [ ] Societies profiles + following
- [ ] Social posts + feed
- [ ] All Post/Society epics complete

### Week 6 (Recommendations done)
- [ ] Recommendation algorithm working
- [ ] Events ranked by relevance
- [ ] All Recommendation epic complete

### Week 8 (Launch ready)
- [ ] All core features complete
- [ ] Tests passing
- [ ] Deployed to production
- [ ] Demo prepared

---

## CRITICAL PATH

**Blocking dependencies:**
1. Events database schema (blocks all event endpoints)
2. Events endpoints (blocks registration, edit, delete)
3. Societies/followers (blocks social feed, recommendations)
4. Recommendation algorithm (blocks personalized discovery)
5. Multilingual (blocks final UI polish)

**Cannot parallelize:** Events → Societies → Recommendations

**Can parallelize:** Database work (Person A) + Endpoint work (Person B/C)

---

## If Behind Schedule (Priority Order)

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

From the original Jira plan:

| Epic | Weeks | Status |
|------|-------|--------|
| 1: Authentication | 1 (done) | ✅ Complete |
| 2: Event Discovery | 1-2 | 🔄 In Progress |
| 3: Social Posts | 3-4 | ⏳ Pending |
| 4: Recommendations | 5-6 | ⏳ Pending |
| 5: Multilingual | 7 | ⏳ Pending |
| 6: Society Dashboard | 4 | ⏳ Pending |
| 7: Admin Functions | 8 | ⏳ Pending (if time) |

---

## Key Documents

**Reference:**
- `/docs/API_SPECS.md` - All endpoint specifications
- `/src/app/api/auth/login/route.js` - Pattern to follow
- `REQUIREMENTS.md` - Full SRS
- `SEMYON_TASKS.md` - Tech lead weekly tasks

**To Create:**
- Development patterns guide (Week 1)
- Database schema detailed spec (Week 1)
- Societies/Posts API spec (Week 3)
- Recommendations spec (Week 5)
- Deployment guide (Week 8)

---

**Last Updated:** Feb 5, 2026
**Owner:** Semyon (Tech Lead)
**Status:** Active - Start Week 1 immediately
