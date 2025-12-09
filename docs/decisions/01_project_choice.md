# Project Evolution & Decision History

**How We Chose the University Society Platform**

This document chronicles the decision-making process that led to our final project scope. Understanding this evolution demonstrates our architectural thinking and problem-solving approach.

---

## Table of Contents

1. [Context: The Assignment](#1-context-the-assignment)
2. [Option A: Web-Based CAD System (Rejected)](#2-option-a-web-based-cad-system-rejected)
3. [Option B: University Society Platform (Chosen)](#3-option-b-university-society-platform-chosen)
4. [Scope Evolution](#4-scope-evolution)
5. [Final Decision Rationale](#5-final-decision-rationale)
6. [What We Learned](#6-what-we-learned)

---

## 1. Context: The Assignment

### Module Requirements

**Course:** CT216 - Software Engineering I
**Timeline:** 8 weeks development + 6 months total project time
**Weighting:** 40% of module grade
**Team Size:** 4 members
**Prototype Due:** Christmas break

### Technical Requirements

- Full-stack web application
- HTML, CSS, JavaScript, Node.js
- Database integration
- Demonstrate software engineering principles
- Complete documentation and demo

### Our Constraints

1. **Time:** 8 weeks is tight for complex systems
2. **Team Size:** 4 people need parallelizable work
3. **Skill Level:** Mix of experience levels
4. **Other Courses:** Running concurrently with other modules
5. **Assessment:** Need to demonstrate technical depth

---

## 2. Option A: Web-Based CAD System (Rejected)

### The Initial Idea

**Concept:** Browser-based 3D modeling system using OpenCascade.js + Three.js + WebAssembly

**Inspiration:**
- Fusion 360 (Autodesk)
- Onshape (cloud CAD)
- TinkerCAD (simplified web CAD)

**Why It Was Appealing:**

1. **Unique:** Not a typical "CRUD app"
2. **Technically Impressive:** Shows advanced programming skills
3. **Resume Impact:** Stands out on CV
4. **Personal Interest:** Team member passionate about CAD/manufacturing

### Technical Architecture (Proposed)

```
Frontend:
├── Three.js (3D rendering engine)
├── React (UI framework)
└── Custom CAD controls (toolbar, viewport)

Backend:
├── OpenCascade.js (WASM geometry kernel)
├── Node.js API
└── PostgreSQL (design storage)

Integration:
├── BREP/STEP/STL file format conversion
├── WebAssembly <-> JavaScript glue code
└── Memory management between WASM and JS
```

### Why We Rejected It

After 2 weeks of research and prototyping, we identified critical issues:

#### 1. **Time Complexity**

**Geometry Kernel Setup:**
- OpenCascade.js is a C++ library compiled to WebAssembly
- Documentation sparse, community small
- Estimated **3-4 weeks** just setting up the kernel bindings
- Another **2 weeks** for basic 3D operations (sketch, extrude, revolve)

**Total Time:** 5-6 weeks of 8-week timeline just on CAD basics

#### 2. **Technical Overhead**

**Multiple Complex Technologies:**
- Three.js (3D graphics, shaders, cameras, lighting)
- OpenCascade.js (BREP modeling, topology, algorithms)
- WebAssembly (memory management, JS interop)
- File I/O (STEP, STL, BREP format parsers)

**Memory Management Challenges:**
- Shared memory between JavaScript and WASM
- Garbage collection coordination
- Large 3D models (memory leaks risk)

**Format Conversion Pipelines:**
- BREP → Mesh conversion (non-trivial)
- STEP file parsing (complex spec)
- STL export (tessellation algorithms)

#### 3. **Poor Work Division**

**Tightly Coupled Components:**
- Geometry kernel ↔ 3D renderer ↔ UI are deeply interconnected
- Hard to split work across 4 team members
- One person becomes bottleneck (the "geometry expert")

**Example Bottleneck:**
```
Team Member A: "I need the BREP output from geometry kernel"
Team Member B (geometry expert): "Still debugging WASM memory issue..."
Team Member A: "I can't test my renderer without geometry data"
```

**Result:** Sequential work, not parallel. Team underutilized.

#### 4. **Risk Assessment**

**High Chance of Incomplete Deliverable:**
- What if geometry kernel doesn't work by Week 6?
- What if WASM memory issues unsolvable?
- What if file import/export fails?

**Fallback Plan:** None. Can't pivot to simpler CAD without throwing away weeks of work.

#### 5. **Workload Mismatch**

**40% Module Assignment:**
- Other courses running concurrently
- Not a full-semester capstone project
- Need to balance effort across all modules

**CAD System Scope:**
- Realistically a 6-month to 1-year project for 4 people
- Production CAD systems (Onshape, Fusion 360) have teams of 50+ engineers

### Decision Point

**Week 2 Meeting (October 2025):**
> "We need to pivot. CAD is too risky. We need something achievable that still demonstrates technical depth."

---

## 3. Option B: University Society Platform (Chosen)

### The Pivot

After rejecting the CAD system, we brainstormed alternatives:

**Criteria:**
1. **Realistic Scope:** Achievable in 8 weeks
2. **Technical Depth:** Complex enough to demonstrate skills
3. **Work Division:** 4 people can work in parallel
4. **Real-World Value:** Solves actual problem
5. **Resume Impact:** Still impressive, not generic

### Why This Project?

#### 1. **Realistic Scope**

**Achievable Core Features (6 weeks):**
- User authentication (OAuth)
- Event management (CRUD)
- Recommendations (algorithm + caching)
- Social posts
- Multilingual support

**Nice-to-Have Features (2 weeks buffer):**
- Analytics dashboard
- Advanced search
- Notification system

**Result:** Working prototype guaranteed, extras if time allows.

#### 2. **Clear Work Division**

**Feature-Based Parallelization:**
- Person A: Events system (frontend + backend + database)
- Person B: Social posts & feed (frontend + backend + database)
- Person C: Recommendations (algorithm + API + caching)
- Person D: Society dashboard & analytics (frontend + backend)

**Everyone learns full stack, no bottlenecks.**

#### 3. **Modern Stack (Industry-Standard)**

**Technologies:**
- Next.js 14 (App Router) - Modern full-stack framework
- React 18 - Industry-standard UI library
- PostgreSQL - Robust relational database
- Redis - High-performance caching
- Docker - Containerization (DevOps skill)
- AWS - Cloud deployment (resume value)

**Result:** Skills directly transfer to industry jobs.

#### 4. **Required Technologies Alignment**

**Assignment Requirements:**
- HTML, CSS (Next.js + Bootstrap)
- JavaScript (React + Node.js)
- Node.js (Next.js backend, API routes)
- Database (PostgreSQL)

**Bonus Skills:**
- TypeScript (type safety)
- Docker (DevOps)
- Redis (caching)
- OAuth (authentication)
- AWS (cloud deployment)

#### 5. **Real-World Application**

**Problem We're Solving:**
- Students overwhelmed by society events
- Discovery problem (how to find relevant events?)
- Societies struggle to reach target audience
- Language barrier (Irish vs. English content)

**Impact:**
- Potentially deploy for real campus use
- User feedback from actual students
- Portfolio project with real users

#### 6. **Resume Impact**

**Demonstrates:**
- Full-stack development
- Database design (normalized + JSONB)
- Caching strategies (Redis)
- Recommendation algorithms
- Multilingual architecture
- Cloud deployment (AWS)
- DevOps (Docker, CI/CD)

**Interview Talking Points:**
- "Built personalized recommendation engine using collaborative filtering"
- "Designed multilingual database schema supporting Irish and English"
- "Implemented Redis caching, reduced API response times by 60%"
- "Deployed scalable architecture on AWS with RDS, ElastiCache, and ECS"

---

## 4. Scope Evolution

The project evolved through several iterations:

### Stage 1: Pure Event Listing System (Week 2)

**Initial Scope:**
- Basic CRUD for events
- Simple discovery (list all events)
- User registration for events

**Problem:** Too simple, not impressive enough.

### Stage 2: Event Recommender System (Week 3)

**Added:**
- Personalized event suggestions
- Society memberships integration
- Interest-based filtering

**Problem:** Still feels generic (Netflix-style recommender).

### Stage 3: Social Media Exploration (Week 3-4)

**Research Question:** What if we make it a full social platform?

**Explored:**
- Multilingual Irish/English platform
- Database design for translations (JSONB vs. tables)
- Translation strategies (user-provided vs. auto-translate)

**Insight:** Social posts are valuable (memes, trip photos, informal communication).

**Documents Created:**
- Database design comparison (normalized vs. JSONB)
- Translation strategy analysis

### Stage 4: Hybrid Platform - FINAL (Week 4)

**Decision:** Combine formal events AND casual social posts.

**Final Scope:**
1. **Events System** (formal, structured)
   - Societies create events with capacity, location, date
   - Students register and track attendance

2. **Social Posts** (casual, flexible)
   - Memes, trip photos, quick announcements
   - No formal structure needed
   - Image uploads supported

3. **Recommender Engine** (for both events and posts)
   - Personalized suggestions
   - Scoring based on memberships, past attendance, interests

4. **University Integration**
   - OAuth authentication
   - Student data sync (courses, societies)

5. **Multilingual Support**
   - Irish + English UI (next-intl)
   - User-generated content translations (manual, auto, single language)

**Why Hybrid?**
- Societies need **both** formal events AND casual communication
- Students discover societies through personality/culture (not just events)
- More interaction data → better recommendations
- Shows architectural flexibility (events + posts share infrastructure)

---

## 5. Final Decision Rationale

### Comparison Matrix

| Criterion | CAD System | Society Platform | Winner |
|-----------|-----------|------------------|--------|
| **Timeline Risk** | High (6-8 weeks just for basics) | Low (prototype in 4 weeks) | Platform |
| **Technical Depth** | Very High (WASM, 3D, geometry) | High (recommendations, caching, multilingual) | Both |
| **Work Division** | Poor (sequential bottlenecks) | Excellent (parallel features) | Platform |
| **Resume Value** | Very High (unique) | High (full-stack + algorithms) | CAD (slight edge) |
| **Real-World Use** | Unlikely (toy CAD) | High (campus deployment) | Platform |
| **Learning Outcomes** | Specialized (3D/WASM) | Broad (full-stack) | Platform (for job market) |
| **Completion Risk** | High (may not finish) | Low (MVP guaranteed) | Platform |

### Final Vote (Week 4 Meeting)

**Outcome:** Unanimous decision for Society Platform.

**Rationale:**
- **Better fit for timeline and team size**
- **Lower risk, higher completion probability**
- **Broader skill development (better for careers)**
- **Real-world applicability**
- **Still technically impressive** (recommendations, multilingual, caching)

---

## 6. What We Learned

### Decision-Making Process

1. **Research First:** We spent 2 weeks researching CAD before committing.
2. **Prototype Early:** Built small CAD proof-of-concept, identified issues.
3. **Cut Losses:** Recognized sunk cost, pivoted early (not Week 6).
4. **Criteria-Based:** Used objective criteria matrix, not emotion.
5. **Team Consensus:** Everyone agreed on final decision.

### Project Scoping Skills

**Key Insights:**
- **Unique ≠ Better:** CAD was unique but impractical.
- **Scope Creep Protection:** Defined MVP early (auth + events + recommendations).
- **Buffer Time:** Always plan for unknowns (2 weeks buffer in timeline).
- **Parallelizable Work:** Architecture must support 4 people working independently.

### Technical Research

**Process:**
1. Identify core technologies (OpenCascade.js, Three.js)
2. Build minimal proof-of-concept (1 week)
3. Estimate complexity (honest, not optimistic)
4. Check team capacity (skills + availability)
5. Assess risk (what if it doesn't work?)

### Risk Management

**CAD System Risks:**
- High technical complexity (WASM, geometry)
- Poor documentation (OpenCascade.js)
- Single point of failure (geometry expert)
- No fallback plan

**Society Platform Risks:**
- OAuth approval delayed → build mock OAuth first
- Student API unavailable → manual interest selection
- Timeline slippage → prioritize MVP features
- AWS costs → stay on homelab, document migration plan

---

## Conclusion

**The Evolution:**
```
Week 1-2: CAD System (ambitious, risky)
    ↓
Week 3: Event Listing (too simple)
    ↓
Week 3: Event Recommender (interesting, but generic)
    ↓
Week 3-4: Social Media Research (multilingual architecture)
    ↓
Week 4: Hybrid Platform (events + posts + recommendations) ← FINAL
```

**Key Takeaway:**
> "A completed project with excellent execution beats an incomplete project with ambitious goals. We chose achievability without sacrificing technical depth."

**Result:**
- Working prototype delivered by Christmas break
- Full-stack experience for all team members
- Real-world deployment potential
- Strong portfolio project
- High grade for 40% module weighting

---

**Related Documents:**
- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) - Complete project scope
- [02_TECHNOLOGY_DECISIONS.md](./02_TECHNOLOGY_DECISIONS.md) - Why we chose specific technologies
- [SOFTWARE_REQUIREMENTS_SPECIFICATION.md](./SOFTWARE_REQUIREMENTS_SPECIFICATION.md) - Formal requirements

---

**Last Updated:** November 24, 2025
**Author:** Development Team
**Maintained By:** Semyon (Project Manager)
