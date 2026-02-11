# SocsBoard Documentation

**CT216 Software Engineering I - University Society Platform**

A full-stack social platform connecting university students with society events and content through personalized recommendations, featuring multilingual support (Irish + English).

---

## Quick Start by Role

### For New Team Members
1. **[TEAM_GUIDE.md](TEAM_GUIDE.md)** - Complete onboarding (read this first!)
2. **[SETUP.md](../SETUP.md)** - Set up your dev environment
3. **[DEVELOPMENT_PATTERNS.md](DEVELOPMENT_PATTERNS.md)** - How to write code
4. **[API_SPECS.md](API_SPECS.md)** - What you'll be building

### For Experienced Developers
1. **[DEVELOPMENT_PATTERNS.md](DEVELOPMENT_PATTERNS.md)** - Code patterns & examples
2. **[API_SPECS.md](API_SPECS.md)** - Feature specifications
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** - System design
4. **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Database structure

### For Tech Leads
1. **[TECH_LEAD_GUIDE.md](TECH_LEAD_GUIDE.md)** - Your responsibilities & checklist
2. **[../PLANNING.md](../PLANNING.md)** - Sprint timeline & assignments
3. **[ARCHITECTURE.md](ARCHITECTURE.md)** - Design decisions
4. **[DECISIONS.md](DECISIONS.md)** - Architecture decision records

### For DevOps / Deployment
1. **[DEPLOYMENT.md](DEPLOYMENT.md)** - AWS Amplify + Lambda production deployment
2. **[AMPLIFY_POSTGRES_SETUP.md](AMPLIFY_POSTGRES_SETUP.md)** - Team collaboration with Amplify + PostgreSQL
3. **[../SETUP.md](../SETUP.md)** - Local development setup
4. **[archive/](archive/)** - Historical deployment guides and research

---

## Documentation Index

### Onboarding & Getting Started

| Document | Description |
|----------|-------------|
| **[TEAM_GUIDE.md](TEAM_GUIDE.md)** | Complete onboarding guide for new team members |
| **[TECH_LEAD_GUIDE.md](TECH_LEAD_GUIDE.md)** | Tech lead responsibilities, code review checklist, decision-making |
| **[DEVELOPMENT_PATTERNS.md](DEVELOPMENT_PATTERNS.md)** | Code patterns, examples, and standards to follow |
| **[../SETUP.md](../SETUP.md)** | Local development environment setup |

### Building Features

| Document | Description |
|----------|-------------|
| **[API_SPECS.md](API_SPECS.md)** | API endpoint specifications (what to build) |
| **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** | Database schema and table definitions |
| **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** | Development workflow and standards |
| **[REQUIREMENTS.md](REQUIREMENTS.md)** | Formal software requirements specification |

### Architecture & Design

| Document | Description |
|----------|-------------|
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System architecture and technical design |
| **[DECISIONS.md](DECISIONS.md)** | Architecture decisions summary with rationale |

### Deployment & Operations

| Document | Description |
|----------|-------------|
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | AWS Amplify + Lambda production deployment |
| **[AMPLIFY_POSTGRES_SETUP.md](AMPLIFY_POSTGRES_SETUP.md)** | Team collaboration with Amplify + PostgreSQL |

### Implementation Guides

| Document | Description |
|----------|-------------|
| **[guides/redis_caching.md](guides/redis_caching.md)** | Caching strategies and implementation |
| **[../PLANNING.md](../PLANNING.md)** | Sprint timeline and team assignments |
| **[../TODO.md](../TODO.md)** | Active blockers and tasks |

### Archived Documentation

Historical research, decision records, and alternative approaches:

| Document | Description |
|----------|-------------|
| **[archive/decisions/](archive/decisions/)** | Detailed decision records (93KB research) |
| **[archive/2025-02-AWS_MIGRATION_RESEARCH.md](archive/2025-02-AWS_MIGRATION_RESEARCH.md)** | AWS migration analysis (70KB) |
| **[archive/2025-02-AMPLIFY_DEPLOYMENT.md](archive/2025-02-AMPLIFY_DEPLOYMENT.md)** | Original Amplify deployment guide |
| **[archive/2025-02-DEPLOYMENT_DOCKER.md](archive/2025-02-DEPLOYMENT_DOCKER.md)** | Docker deployment guide |
| **[archive/2025-02-CLOUDFLARE_TUNNEL.md](archive/2025-02-CLOUDFLARE_TUNNEL.md)** | Previous Cloudflare setup |
| **[archive/Stack_Diagram.excalidraw.md](archive/Stack_Diagram.excalidraw.md)** | Architecture diagrams |
| **[archive/Wireframes.excalidraw.md](archive/Wireframes.excalidraw.md)** | UI/UX wireframes |

### Reference Materials

- **[../GLOSSARY.md](../GLOSSARY.md)** - Technical term definitions
- **[../REFACTORING_RECORD.md](../REFACTORING_RECORD.md)** - Documentation refactoring log

---

## Project Overview

### What We're Building

A platform that:
- **Connects** university students with society events and content
- **Recommends** personalized events based on interests and memberships
- **Supports** Irish (Gaeilge) and English languages
- **Integrates** with university systems (OAuth, student data)
- **Deploys** on AWS with Docker (scalable architecture)

### Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Bootstrap 5
- **Backend:** Next.js API Routes, JWT authentication
- **Database:** PostgreSQL 15+ with advanced JSONB features
- **Cache:** Redis 7+
- **DevOps:** Docker, GitHub Actions, AWS
- **i18n:** next-intl (multilingual support)

### Current Status

**Phase:** Active development
**Completed:**
- User authentication (registration, login, JWT)
- Database setup and schema
- Docker containerization
- Basic UI framework

**In Progress:**
- User dashboard and profile management
- Protected routes and authorization
- Events system (CRUD operations)

**Next Up:**
- Social posts feed
- Recommendation engine
- Multilingual support
- AWS deployment

---

## Quick Navigation

### Just Started?
→ **[TEAM_GUIDE.md](TEAM_GUIDE.md)** - Read this first (1 hour onboarding)

---

## Project Structure

```
ct216_project/
├── src/
│   ├── app/                    # Next.js pages and API routes
│   │   ├── api/auth/          # Authentication endpoints
│   │   ├── login/             # Login page
│   │   ├── register/          # Registration page
│   │   └── page.js            # Homepage
│   ├── lib/                   # Utility functions
│   ├── database/              # Database utilities
│   └── context/               # React context providers
├── docs/                       # Documentation (you are here)
│   ├── archive/               # Historical research and decision records
│   ├── guides/                # Implementation guides
│   ├── REQUIREMENTS.md        # Formal SRS
│   ├── ARCHITECTURE.md        # System design
│   ├── DECISIONS.md           # Architecture decisions summary
│   ├── DEVELOPMENT_GUIDE.md   # Dev workflow
│   └── DEPLOYMENT.md          # AWS deployment guide
├── database/                   # Database schema
├── docker-compose.yml         # Docker configuration
├── Dockerfile                 # Container definition
└── README.md                  # Main project README
```

---

## Contributing to Documentation

When adding or updating documentation:

1. **Choose the right location:**
   - Core docs → `docs/` root
   - Implementation guides → `docs/guides/`
   - Historical research → `docs/archive/`

2. **Follow naming conventions:**
   - Core docs: `UPPERCASE.md`
   - Guides: `lowercase_with_underscores.md`
   - Archives: `YYYY-MM-DESCRIPTION.md`

3. **Update this README** if adding a new core document

4. **Add cross-references** to related documents

5. **Include "Last Updated" date** at the bottom of your document

6. **Archive outdated docs** - Move to archive/ with timestamp when no longer current

---

## Module Context

**Module:** CT216 - Software Engineering I
**Team Size:** 4 members
**Duration:** 8 weeks development (active now)
**Weighting:** 40% of module grade

---

## Need Help?

**For Technical Questions:**
- Check relevant documentation above
- Open GitHub issue
- Ask in team Discord/Slack

**For Setup Problems:**
- See [../SETUP.md](../SETUP.md)
- See [DEPLOYMENT.md](DEPLOYMENT.md)

**For Architecture Questions:**
- See [ARCHITECTURE.md](ARCHITECTURE.md)
- See [DECISIONS.md](DECISIONS.md)
- See archived decision docs in `archive/decisions/`

**For Team Coordination:**
- Contact Semyon (Project Manager)

---

**Last Updated:** February 11, 2026
**Maintained By:** Semyon (Project Manager)
**Version:** 4.0 (Documentation refactoring - see ../REFACTORING_RECORD.md)
