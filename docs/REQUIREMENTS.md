# SocsBoard

## Software Requirements Specification

**Version:** 1
**Date:** 7/11/25
**Team:** Caoilfhionn Fitzpatrick, Samuel Regan, Semyon Fox, Shreyansh Singh

Prepared for CT216 - Software Engineering I

---

## Table of Contents

1. [Introduction](#1-introduction)
   - 1.1 [Purpose](#11-purpose)
   - 1.2 [Key Stakeholders](#12-key-stakeholders)
   - 1.3 [Scope, Objectives and Goals](#13-scope-objectives-and-goals)
   - 1.4 [References](#14-references)
   - 1.5 [Overview](#15-overview)
2. [Functional Requirements](#2-functional-requirements)
   - 2.1 [User Stories](#21-user-stories)
   - 2.2 [Interface Requirements](#22-interface-requirements)
3. [Project Timeline](#3-project-timeline)
4. [Appendices](#a-appendices)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) document provides a comprehensive description of the University Society Platform (SocsBoard) project requirements. It details the functional and non-functional requirements, user stories, and acceptance criteria for the platform.

**The SRS is intended for:**
- The development team
- The project manager (Semyon Fox) for reviews and approval management
- Module instructors and academic assessors
- Future maintainers and contributors
- Stakeholders interested in the technical scope and deliverables

**This document serves as the foundation for:**
- Development planning and task allocation
- Testing and quality assurance
- Project progress tracking
- Academic evaluation

### 1.2 Key Stakeholders

1. **Project Manager:** Semyon
   - Responsible for pull request reviews and approvals
   - Manage merge conflicts and code quality
   - Facilitates architecture decisions
   - Coordinates team tasks

2. **Development Team:** 4 full-stack developers
   - Build features through, end to end (frontend, backend, database)
   - Write tests and documentation for their features
   - Participate in code reviews
   - Own 2-3 features each

3. **End Users:**
   - **Students:** Discover society events and updates, view society posts/events, show interest in an event and receive personalised recommendations
   - **Society Committee:** Create and manage events, posted content and view engagement analytics
   - **Sudo:** Platform management, user moderation, system monitoring

4. **University Administration:**
   - Provide OAuth authentication services
   - Supply student data (by API access)
   - Approve production deployment

5. **Academic Assessors:**
   - Module teaching staff evaluating deliverables
   - Assess technical implementation, documentation and knowledge

### 1.3 Scope, Objectives and Goals

#### 1.3.1 Software System Identified

The **SocsBoard (University Society Platform)** is a full-stack web-based social and event platform with a recommendation engine that connects students with society events and social content through personalized relevance scoring.

**Current Deployment:** The platform is currently hosted at https://redacted-domain-name.ie using a Cloudflare Tunnel. The application runs securely within Docker containers with all databases isolated in a dedicated subnet on a private server infrastructure.

#### 1.3.2 Scope

**What the system WILL do:**
- Provide full event management capabilities, including creation, promotion, capacity tracking, and multilingual descriptions
- Support social content sharing through posts, images, and informal updates
- Deliver personalized recommendations based on user behavior, interests, and society memberships
- Handle authentication through university OAuth (Microsoft Azure AD) with automatic synchronization of student data (course, department, year, memberships) (Subject to approval by ISS)
- Ensure GDPR compliance and support both English and Irish UI languages, with optional translation for user-generated content
- Provide analytics dashboards displaying engagement trends, demographics, and event performance metrics

**What the system will NOT do:**
- Payment processing, ticketing, or any financial transactions
- Private messaging or chat functionality
- Academic features (grades, timetables, assignments)

#### 1.3.3 Benefits

**For Students:**
- Discover relevant events through personalized recommendations
- Access all society activity in one centralized location
- Benefit from multilingual support
- Easily register for and track event attendance

**For Societies:**
- Promote events centrally
- Share both formal and casual content
- Analyze engagement metrics
- Reach students beyond their current membership

**For the University:**
- Gain improved engagement insights
- Track participation rates
- Enhance student experience
- Obtain data-driven visibility into campus life

#### 1.3.4 Technical Objectives

**Learning and Development:**
- Develop full-stack expertise using Next.js, React, PostgreSQL, and Redis
- Learn server-side rendering, client-side rendering, caching strategies, and OAuth implementation
- Adopt DevOps practices including Docker, CI/CD pipelines, and AWS deployment
- Build a multilingual application from the ground up

**Performance Targets:**
- Fast page-load times for slower mobile connections, or bad WiFi coverage areas on campus
- Support for 100+ concurrent users
- Efficient Redis caching implementation

**Security Requirements:**
- Secure OAuth implementation with no password storage
- Protection against XSS/CSRF/SQL-injection attacks
- GDPR compliance

**Scalability Goals:**
- Database architecture that supports potentially thousands of users
- Extensible system design
- Cache-based recommendation engine
- Horizontal scaling capability

#### 1.3.5 Project Goals

**Academic:**
- Deliver a functional prototype by Christmas with documentation and demonstrations
- Achieve high module performance
- Demonstrate strong software engineering practices throughout development

**Career Development:**
- Produce a portfolio-quality project showcasing industry-standard tooling experience
- Improve teamwork and code review skills
- Create compelling interview talking points

**Real-World Impact:**
- Address the genuine problem of student event discovery
- Enable potential campus deployment
- Gather feedback from actual users
- Iterate based on live usage patterns

### 1.4 References

#### 1.4.1 Project Documentation

This SRS references the following internal project documents:

1. **README.md & ARCHITECTURE.md**
   - Complete project scope and evolution
   - 8-week timeline
   - Team structure and approach
   - Technical architecture decisions
   - Source: `/README.md` and `/docs/ARCHITECTURE.md`

2. **ARCHITECTURE.md**
   - Technical architecture decisions
   - Database schema design
   - Technology stack rationale
   - Source: `/docs/ARCHITECTURE.md`

3. **DEPLOYMENT.md**
   - Docker setup and deployment
   - CI/CD pipeline configuration
   - Source: `/docs/DEPLOYMENT.md`

4. **guides/redis_caching.md**
   - Redis implementation details
   - Caching strategies and patterns
   - Performance optimization
   - Source: `/docs/guides/redis_caching.md`
#### 1.4.2 External References

The following external documentation and technical resources are referenced:

- **Next.js Documentation** (v14+): https://nextjs.org/docs
- **React Documentation** (v18+): https://react.dev
- **PostgreSQL Documentation** (v15+): https://www.postgresql.org/docs/15/
- **Redis Documentation** (v7+): https://redis.io/docs
- **Bootstrap Documentation** (v5.3): https://getbootstrap.com/docs/5.3/
- **next-intl Documentation**: https://next-intl-docs.vercel.app
- **Microsoft Azure AD OAuth Documentation**: https://learn.microsoft.com/en-us/azure/active-directory/

#### 1.4.3 Module Requirements

- **CT216 Software Engineering I Course Outline** - University College, Academic Year 2025/26
- **Project Brief:** Full-stack web application using HTML, CSS, JavaScript, and Node.js
- **Assessment Criteria:** 40% of module grade
- **Submission Deadlines:**
  - Prototype: Christmas break
  - Total project time: 6 months

### 1.5 Overview

This SRS document is organized into the following sections:

**Section 1: Introduction** - Establishes the document's purpose, identifies key stakeholders and their roles, defines the project scope with clear boundaries, lists reference documents, and provides this structural overview.

**Section 2: Functional Requirements** - Contains user stories organized by epic (Authentication, Events, Social Posts, Recommendations, etc.) with acceptance criteria, plus interface requirements covering UI design philosophy and API structure.

**Section 3: Project Timeline** - Outlines development phases, key milestones, and risk management strategies. Detailed Gantt charts maintained separately.

**Appendices** - Supplementary material including glossary and additional technical details. Appendix content is informational and not part of the formal requirements unless explicitly stated.

---

## 2. Functional Requirements

### 2.1 User Stories

#### Epic 1: User Authentication & Profile Management

**User Story 1.1: University OAuth Login**
- "As a student or society member, I want to log in using my university account credentials so that I can access the platform securely without creating a separate password."
- **Acceptance Criteria:**
  1. User can click "Login with University Account" button on the landing page
  2. User is redirected to Microsoft Azure AD authentication page
  3. System receives OAuth callback and exchanges authorization code for access token
  4. System creates or updates user record in the database
  5. User is redirected to personalized dashboard
  6. User remains logged in across browser sessions

**User Story 1.2: User Profile Setup**
- "As a new user, I want to complete my profile with interests and preferences so that I receive personalized recommendations."
- **Acceptance Criteria:**
  1. After first login, user is prompted to complete profile
  2. User can select interests from predefined categories (sports, music, technology, arts, etc.)
  3. User can set language preference (Irish or English)
  4. Changes are saved and reflected immediately
  5. Recommendations are updated based on new interests

**User Story 1.3: Session Management**
- "As a logged-in user, I want to stay logged in securely across sessions so that I don't have to re-authenticate every visit."
- **Acceptance Criteria:**
  1. User session is stored in Redis with TTL
  2. User can manually log out, invalidating their session
  3. User sees "Session expired" message after inactivity period
  4. Multiple concurrent sessions are supported

---

#### Epic 2: Event Discovery & Management

**User Story 2.1: Browse Events**
- "As a student, I want to browse upcoming events so that I can discover activities that interest me."
- **Acceptance Criteria:**
  1. Landing page shows list of upcoming events sorted by date
  2. Each event card displays: title, society name, date/time, location, thumbnail
  3. Events show remaining capacity if limited
  4. User can filter by date range, society, and category
  5. User can search events by keyword
  6. "Recommended for You" section appears at top

**User Story 2.2: View Event Details**
- "As a student, I want to view detailed information about an event so that I can decide whether to attend."
- **Acceptance Criteria:**
  1. Event detail page shows full description, date, location, society info
  2. Shows number of registered attendees and capacity
  3. "Register" button visible (or "Registered" if already registered)
  4. Translation badge shows if content is auto-translated

**User Story 2.3: Register for Event**
- "As a student, I want to register for an event so that I can attend and receive updates."
- **Acceptance Criteria:**
  1. User clicks "Register" button on event detail page
  2. If capacity limit reached, user is added to waitlist
  3. User sees confirmation message
  4. User can unregister by clicking "Cancel Registration"
  5. Capacity count updates accordingly

**User Story 2.4: Create Event (Society Admin)**
- "As a society committee member, I want to create a new event so that students can discover and attend it."
- **Acceptance Criteria:**
  1. User with society admin role sees "Create Event" button
  2. Form includes: title, description, date/time, location, capacity, image, category
  3. Language options: provide both languages, auto-translate, or single language
  4. Event can be saved as draft or published
  5. Event appears in listings immediately upon publishing

**User Story 2.5: Edit/Delete Event**
- "As a society committee member, I want to edit or delete an event so that I can correct mistakes or cancel events."
- **Acceptance Criteria:**
  1. Society admin sees "Edit" and "Delete" buttons on their events
  2. Edit opens form pre-filled with existing data
  3. Delete requires confirmation
  4. Registered users notified if event is cancelled

**User Story 2.6: Calendar Integration**
- "As a student, I want to add events to my personal calendar so that I don't miss events I'm interested in."
- **Acceptance Criteria:**
  1. "Add to Calendar" button visible on event detail page
  2. Generates .ics file compatible with major calendar applications
  3. Calendar integration for registered events and expressed interest
  4. Calendar entries include: event title, date/time, location, description, society info
  5. Supports Google Calendar, Apple Calendar, Outlook, and other iCalendar-compatible applications

---

#### Epic 3: Social Posts & Society Interaction

**User Story 3.1: Create Social Post**
- "As a society member, I want to post casual content so that I can engage with students informally."
- **Acceptance Criteria:**
  1. Society member sees "Create Post" button
  2. Form includes text content and optional image upload
  3. Post appears in society feed immediately

**User Story 3.2: View Social Feed**
- "As a student, I want to see posts from societies I follow so that I can stay updated."
- **Acceptance Criteria:**
  1. User sees "Social Feed" section on dashboard
  2. Feed shows posts from followed societies
  3. Posts display: society name, content, image, timestamp
  4. Posts sorted by recency or relevance

**User Story 3.3: Interact with Posts**
- "As a student, I want to like or ignore posts so that the system learns my preferences."
- **Acceptance Criteria:**
  1. User can click "Like" button on any post
  2. User can click "Not Interested" to hide post
  3. Interactions recorded for recommendation algorithm

**User Story 3.4: Follow/Unfollow Society**
- "As a student, I want to follow societies I'm interested in so that I see their events and posts."
- **Acceptance Criteria:**
  1. "Follow" button on society profile page
  2. Button toggles to "Following" when clicked
  3. User can unfollow at any time
  4. Followed societies appear on user dashboard

---

#### Epic 4: Personalized Recommendations

**User Story 4.1: Receive Event Recommendations**
- "As a student, I want to see personalized event recommendations so that I discover relevant activities without searching."
- **Acceptance Criteria:**
  1. "Recommended for You" section on dashboard
  2. Shows top recommended events
  3. Each recommendation shows reason ("Because you attended...", "Popular in your department")
  4. Recommendations based on: society memberships, past attendance, stated interests, department
  5. User can dismiss recommendations ("Not Interested")

**User Story 4.2: Recommendation Feedback**
- "As a student, I want to provide feedback on recommendations so that the system improves over time."
- **Acceptance Criteria:**
  1. Each recommendation has "Interested" and "Not Interested" buttons
  2. Feedback influences future recommendations
  3. User can see why content was recommended

---

#### Epic 5: Multilingual Support

**User Story 5.1: Switch Language**
- "As a user, I want to switch between English and Irish so that I can use the platform in my preferred language."
- **Acceptance Criteria:**
  1. Language selector visible in navigation header
  2. UI elements change immediately on selection
  3. Language preference saved
  4. User-generated content displays in selected language if available
  5. Fallback to English with notice if translation unavailable
  6. Translator dashboard available for managing translations
  7. Users can request human translations via ticketing system

**User Story 5.2: Create Multilingual Content**
- "As a society admin, I want to create content in both English and Irish so that all students can engage."
- **Acceptance Criteria:**
  1. Event/post form has tabs for both languages
  2. User can provide manual translations
  3. Auto-translate option available (DeepL API)
  4. Translation quality badge displayed on content
  5. Translator role can review and edit translations via dashboard
  6. Human translation requests can be submitted for educational purposes

**User Story 5.3: Upload Multilingual Posters**
- "As a society admin, I want to upload posters with optional translations so that events are visually appealing and accessible to all."
- **Acceptance Criteria:**
  1. Event creation form includes an option to upload posters
  2. Posters can have an optional Irish version
  3. Posters are displayed alongside event details
  4. Translator role can add additional language versions of posters

**Future Scope:**
- Expand language support beyond English and Irish to include other languages such as Hindi, Chinese, French, etc.
- Enable crowdsourced translations for user-generated content and posters
- Build a community-driven translation system with incentives for contributors

---

#### Epic 6: Society Dashboard & Analytics

**User Story 6.1: View Society Dashboard**
- "As a society committee member, I want to access a dashboard with all management tools so that I can efficiently manage events and posts."
- **Acceptance Criteria:**
  1. Dashboard shows: upcoming events, recent posts, follower count
  2. Quick actions: "Create Event", "Create Post"
  3. Analytics summary visible

**User Story 6.2: View Engagement Analytics**
- "As a society committee member, I want to see analytics about engagement so that I can understand what content resonates."
- **Acceptance Criteria:**
  1. Analytics show: registration trends, attendance rates, post engagement, follower growth
  2. Demographics breakdown: department, year of study
  3. Data visualized with charts
  4. Filterable by date range

---

#### Epic 7: Administrative Functions

**User Story 7.1: Moderate Content**
- "As a super admin, I want to review and moderate content so that the platform remains safe and appropriate."
- **Acceptance Criteria:**
  1. Admin panel shows reported posts and events
  2. Admin can delete or hide inappropriate content
  3. Admin can ban users with confirmation
  4. Actions logged in audit trail

**User Story 7.2: View Platform Analytics**
- "As a super admin, I want to view platform-wide analytics so that I can monitor system health and usage."
- **Acceptance Criteria:**
  1. Shows: total users, active users, total events, total posts
  2. Most popular societies
  3. Trends visualized with charts

---

### 2.2 Interface Requirements

#### 2.2.1 User Interfaces

**Design Philosophy:**

| Interface | Approach | Rationale |
|-----------|----------|-----------|
| **Society Dashboard / Admin** | Desktop-first | Complex data tables, analytics charts, multi-field forms - optimized for larger screens |
| **Student Interface** | Mobile-first | Casual browsing, quick event check-ins, social feed scrolling - primary use case is phone |

*Note: Future consideration for Cordova wrapper for app store distribution - trades native experience for increased app size.*

**UI/UX Design Principles:**

- **Consistent & Modern:** Clean, unified design language across all interfaces with smooth transitions and modern aesthetics
- **Accessible:** Easy to use for all users regardless of technical ability
- **Feed-Based Discovery:** Instagram-like scrolling experience for recommendations, designed to be engaging without being "doomscrolly"
- **Perplexity-Inspired Sidebar:** Clean navigation with main options:
  - Search
  - Explore
  - Societies
  - Events
  - Calendar
  - Dashboard (conditional - only visible to society admins)

**Unauthenticated Access:**
- Platform viewable without login (non-personalized results)
- All user interactions blocked until authentication
- Browse events, societies, and content in read-only mode
- Login required for: following, liking, registering, posting, analytics

**Key Interface Components:**

1. **Landing Page (Unauthenticated)**
   - Hero section with platform tagline and login button
   - Featured events preview (non-personalized)
   - Language selector
   - Perplexity-style sidebar with limited navigation

2. **Student Dashboard (Authenticated)**
   - Feed-based recommendation display (Instagram-like scrolling)
   - Upcoming registered events with calendar view
   - Social feed from followed societies
   - Sidebar navigation: Search, Explore, Societies, Events, Calendar
   - Integrated calendar view showing registered events and events of interest

3. **Event Detail Page**
   - Full event information with banner image
   - Registration button with capacity indicator (login required)
   - "Add to Calendar" button for calendar integration
   - Society information card
   - Similar events suggestions

4. **Calendar View**
   - Monthly/weekly calendar displaying registered events
   - Visual indicators for events with expressed interest
   - "Add to Personal Calendar" integration (.ics export)
   - Filter by society or event type
   - Click event to view details

5. **Society Dashboard (Committee View)**
   - Event/post management with CRUD actions
   - Analytics overview with charts
   - Follower metrics
   - Additional "Dashboard" option in sidebar

6. **Social Feed**
   - Card-based post layout with smooth scrolling
   - Infinite scroll (engaging but not addictive)
   - Like and "Not Interested" actions (authenticated only)

**Calendar Features Summary:**
- In-platform calendar view for all registered events and events of interest
- Export to personal calendars via .ics file generation
- Compatible with Google Calendar, Apple Calendar, Outlook, and other iCalendar applications
- Automatic calendar entries for event registrations
- Optional calendar integration for expressed interest

*Mockups to be created using Excalidraw/Figma and stored in `/mockups/` directory.*

#### 2.2.2 API Interface

RESTful JSON API with JWT authentication.

**Endpoint Groups:**
- `/api/auth/*` - OAuth login, callback, logout, token refresh
- `/api/users/*` - Profile management, interests
- `/api/events/*` - Event CRUD, registration, search
- `/api/posts/*` - Post CRUD, feed
- `/api/societies/*` - Society profiles, follow/unfollow, analytics
- `/api/recommendations` - Personalized content
- `/api/interactions` - Likes, ignores, feedback
- `/api/translate` - DeepL API proxy

**Rate Limiting:** 100 req/min (authenticated), 20 req/min (unauthenticated)

**Authentication:** JWT token in `Authorization: Bearer <token>` header

#### 2.2.3 External System Interfaces

1. **University OAuth (Microsoft Azure AD)**
   - OAuth 2.0 authorization code flow
   - Scopes: openid, profile, email, User.Read
   - Callback URL configured in Azure portal

2. **Student Data API** (Subject to ISS approval)
   - Sync student data: courses, department, year, society memberships
   - Daily sync via cron job + manual refresh option

3. **DeepL Translation API**
   - Auto-translate user-generated content
   - English ↔ Irish translations
   - Usage monitoring to stay within quota

#### 2.2.4 Infrastructure

**Current Deployment Architecture:**
- **Hosting:** Self-hosted server accessible via https://redacted-domain-name.ie
- **Cloudflare Tunnel:** Secure tunnel for external access without exposing server ports
- **Cloudflare CDN:** Global content delivery with automatic caching
- **Docker Containerization:** All services (Next.js, PostgreSQL, Redis) run in isolated containers
- **Network Security:** Dedicated subnet isolating databases from external access
- **SSL/TLS:** Cloudflare-managed certificates for HTTPS

**Planned Infrastructure Improvements:**

*Note: The following are preliminary plans and not definitive implementations. Final architecture may vary based on performance requirements and resource constraints.*

- **Internal Nginx Proxy:**
  - Nginx layer between Cloudflare and Next.js for enhanced caching
  - Cache static assets locally to reduce Cloudflare CDN misses
  - Load balancing across multiple Next.js instances if needed
  - Additional request filtering and rate limiting

- **Recommendation Algorithm Evolution:**
  - Initial implementation in Python for rapid development
  - Planned rewrite in C++ or Rust for learning purposes
  - Trade-off: temporary production performance impact for skill development
  - Performance optimization post-rewrite

---

## 3. Project Timeline

### 3.1 Project Overview

**Total Duration:** Academic Year 2025/26 (Two Semesters)

**Semester 1 (Completed):**
- Planning and requirements gathering
- Technology stack research and selection
- Infrastructure setup and deployment testing
- GitHub repository setup with CI/CD foundations
- Basic authentication system (bcrypt-based, custom implementation)
- PostgreSQL database (single table)
- Basic UI (home, login, register pages with generic styling)
- Deployment to production server (https://redacted-domain-name.ie)

**Semester 2 (12 Weeks):** Main development phase - all remaining features

**Final Submission:** End of Semester 2, Summer 2026

### 3.2 Semester 2 Development Phases (12 Weeks)

| Week | Phase | Focus Area |
|------|-------|------------|
| 1-2 | 1 | Database schema expansion, OAuth migration, Redis setup |
| 3-4 | 2 | Events system - CRUD, registration, capacity management |
| 5-6 | 3 | Societies & social posts - profiles, following, feed |
| 7-8 | 4 | Recommendation engine - algorithm, batch processing, caching |
| 9 | 5 | Multilingual support - next-intl, translations, DeepL |
| 10 | 6 | Calendar integration, UI/UX polish, accessibility |
| 11 | 7 | Testing, performance optimization, bug fixes |
| 12 | 8 | Final documentation, demo preparation, submission |

### 3.3 Key Milestones

| Milestone | Week | Deliverable |
|-----------|------|-------------|
| M0 (Complete) | S1 | Basic auth, database, deployment, planning |
| M1 | Week 2 | Full database schema, OAuth, Redis operational |
| M2 | Week 4 | Events system fully functional |
| M3 | Week 6 | Societies, posts, and social features complete |
| M4 | Week 8 | Recommendation engine operational |
| M5 | Week 9 | Multilingual support complete |
| M6 | Week 10 | Calendar integration, polished UI |
| M7 | Week 11 | Testing complete, production-ready |
| M8 | Week 12 | Final submission |

### 3.4 Gantt Charts

*[PLACEHOLDER: Detailed Gantt charts to be created and maintained separately]*

### 3.5 Risk Management

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| University OAuth approval delayed | Medium | High | Continue with custom auth, add OAuth if approved |
| Student API access denied | High | Medium | Manual profile setup, no automatic sync |
| Timeline slippage | High | High | Prioritize core features: events, societies, basic recommendations |
| Team member unavailable | Medium | Medium | PM can assist development, task redistribution |
| Recommendation algorithm complexity | Medium | High | Start with simple scoring, optimize later |
| Multilingual implementation time | Medium | Medium | English-only MVP, add Irish if time permits |

**MVP Core Features (Must-Have):**
- Events system (CRUD, registration, basic search)
- Societies (profiles, following)
- Basic recommendation algorithm
- Responsive UI with feed layout

**Secondary Features (Nice-to-Have):**
- Social posts and interactions
- Calendar integration (.ics export)
- Analytics dashboard
- Multilingual support (Irish)
- DeepL auto-translation
- University OAuth migration

**Stretch Goals (If Time Permits):**
- Advanced recommendation algorithm (Python/Rust rewrite)
- Internal Nginx caching layer
- Push notifications
- Student API integration

---

## A. Appendices

*The information contained in these appendices is supplementary and informational. It is not considered part of the formal requirements unless explicitly referenced in Sections 1-3.*

### A.1 Glossary

| Term | Definition |
|------|------------|
| API | Application Programming Interface |
| CSRF | Cross-Site Request Forgery - security vulnerability |
| GDPR | General Data Protection Regulation - EU data privacy law |
| JWT | JSON Web Token - authentication token format |
| OAuth | Open Authorization - delegated authentication standard |
| RBAC | Role-Based Access Control |
| Redis | In-memory data store for caching and sessions |
| SSR/CSR | Server-Side Rendering / Client-Side Rendering |
| TTL | Time To Live - cache expiration time |

### A.2 Technology Stack Summary

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14+, React 18, Bootstrap 5, TypeScript |
| Backend | Next.js API Routes, JWT |
| Database | PostgreSQL 15+ |
| Cache | Redis 7+ |
| Proxy | Nginx |
| DevOps | Docker, GitHub Actions |
| Cloud | AWS (ECS/RDS/ElastiCache) |

### A.3 Database Tables Overview

Core tables (full schema in ARCHITECTURE.md):
- `users` - Student/member profiles
- `student_data` - Synced university data
- `societies` - Society information
- `society_members` - Memberships and roles
- `events` - Event metadata
- `event_translations` - Multilingual event content
- `posts` - Social posts with JSONB translations
- `registrations` - Event attendance
- `interactions` - Likes, ignores, interests
- `recommendations` - Pre-computed suggestions
- `user_interests` - User-selected interests

---

**End of Document**
