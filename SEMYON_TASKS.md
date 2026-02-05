# Semyon's Tech Lead Tasks

**Role:** Project Manager + Tech Lead (Code Review, Architecture, Team Coordination)
**Timeline:** 8 weeks
**Philosophy:** Define what needs building → Team builds it → Review + merge

---

## CRITICAL (This Week)

### 1. Events API Specification
**Status:** TODO
**Effort:** 1-2 hours
**Impact:** Unblocks first feature for team
**Deliverable:** `docs/API_SPECS.md` - Events endpoints with schemas
**Next:** Person B starts building POST /api/events

### 2. GitHub Actions + PR Template
**Status:** TODO
**Effort:** 30 min
**Impact:** Prevents bad code from being merged
**Deliverables:**
- `.github/workflows/lint.yml` - auto-lint on PR
- `.github/pull_request_template.md` - code standards checklist

### 3. Create Feature Task Cards
**Status:** TODO
**Effort:** 1 hour
**Impact:** Tracks progress, assigns work
**Deliverable:** GitHub Issues with acceptance criteria
**Cards needed:**
- Events database schema
- Events CRUD endpoints
- Event registration system
- Societies profiles + following
- Social posts

### 4. Team Assignments
**Status:** TODO
**Effort:** 30 min
**Impact:** Clear ownership, no confusion
**Assignments:**
- Person A: Events database + queries
- Person B: Events API endpoints + registration
- Person C: Societies system (profiles, following, posts)
- Scrum Master: Assign her a clear feature

### 5. Development Patterns Guide
**Status:** TODO
**Effort:** 1 hour
**Impact:** Patterns to follow (reference = auth endpoint)
**Deliverable:** `docs/DEVELOPMENT_GUIDE.md` update with:
- API endpoint pattern
- Response format standard
- Error handling
- JSDoc requirements
- Database query patterns

---

## HIGH PRIORITY (Week 2)

### 6. 8-Week Sprint Plan
**Status:** TODO
**Effort:** 1 hour
**Impact:** Coordination, milestones, realistic timeline
**Deliverable:** `SPRINT_PLAN.md`
- Week 1-2: Events + Registrations
- Week 3-4: Societies + Posts
- Week 5-6: Recommendations
- Week 7: Multilingual
- Week 8: Polish + Deploy
- Who owns what

### 7. Database Schema Specs
**Status:** TODO
**Effort:** 1-2 hours
**Impact:** Person A can build schema without questions
**Deliverable:** `docs/DATABASE_SPECS.md`
- Events table (title, description, date, capacity, society_id, etc.)
- Registrations table (user_id, event_id, status)
- Societies table updates
- Indexes and relationships

### 8. Testing & QA Plan
**Status:** TODO
**Effort:** 1 hour
**Impact:** Team knows what "done" means
**Deliverable:** Testing checklist for each feature
- Manual test cases
- Edge cases to handle
- Performance targets

---

## MEDIUM PRIORITY (Weeks 3-4)

### 9. Deployment & Operations Guide
**Status:** TODO
**Effort:** 2 hours
**Impact:** Someone can deploy without you
**Deliverable:** `docs/OPERATIONS.md`
- Database migrations
- Environment variables
- Health checks
- Monitoring/logs
- Rollback procedure

### 10. Architecture Decision Records
**Status:** TODO
**Effort:** 1-2 hours
**Impact:** Team understands "why" not just "what"
**Deliverable:** Update `docs/decisions/` as needed
- Caching strategy
- Recommendation algorithm approach
- Multilingual implementation

### 11. Create Example Code Snippets
**Status:** TODO
**Effort:** 1 hour
**Impact:** Patterns to copy-paste
**Deliverable:** `docs/CODE_EXAMPLES.md`
- Creating API endpoint
- Database query
- Error response
- Validation

---

## ONGOING (Throughout Project)

### Code Reviews
**Daily:** 30-60 min
- Review all PRs
- Approve if meets standards
- Request changes if needed
- Unblock people

### Team Coordination
**Weekly:**
- Quick sync on blockers
- Adjust assignments if needed
- Update sprint plan
- Celebrate shipped features

### Documentation Updates
**As needed:**
- Add new specs as features emerge
- Update architecture docs
- Document decisions made

---

## COMPLETED ✅

- [x] SRS (source of truth)
- [x] Auth endpoints (logout, me)
- [x] Rate limiting + account lockout
- [x] Documentation updates (OAuth → email auth)
- [x] GitHub setup + permissions

---

## Success Metrics

**By End of Week 1:**
- Events spec written
- PR template + GitHub Actions working
- Person B building events API

**By End of Week 2:**
- Events endpoints shipping
- Societies feature assigned and started

**By End of Week 4:**
- Events + Societies complete
- Recommendations started

**By End of Week 8:**
- Full feature set deployed
- Team ready to present
