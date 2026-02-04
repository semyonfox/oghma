# SocsBoard Documentation

**CT216 Software Engineering I - University Society Platform**

A full-stack social platform connecting university students with society events and content through personalized recommendations, featuring multilingual support (Irish + English).

---

## Quick Start

**New to the project?** Start here:

1. **[Project Overview](#project-overview)** - What we're building
2. **[Setup Guide](../SETUP.md)** - Get your development environment running
3. **[Development Guide](DEVELOPMENT_GUIDE.md)** - Start coding with our standards
4. **[Deployment Guide](DEPLOYMENT.md)** - Deploy to production

---

## Documentation Index

### Core Documents

| Document | Description |
|----------|-------------|
| **[REQUIREMENTS.md](REQUIREMENTS.md)** | Formal software requirements specification |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | System architecture and technical design |
| **[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)** | Development workflow and coding standards |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | Production deployment guide |

### Decision Records

Why we made certain architectural and technology choices:

| Document | Topic |
|----------|-------|
| **[decisions/01_project_choice.md](decisions/01_project_choice.md)** | Why we chose this project over alternatives |
| **[decisions/02_tech_stack.md](decisions/02_tech_stack.md)** | Technology stack rationale (Next.js, PostgreSQL, Redis) |
| **[decisions/03_database_design.md](decisions/03_database_design.md)** | Database schema and translation storage strategies |
| **[decisions/04_recommendation_system.md](decisions/04_recommendation_system.md)** | Recommendation algorithm design |

### Implementation Guides

Detailed technical guides for specific features:

| Document | Topic |
|----------|-------|
| **[guides/redis_caching.md](guides/redis_caching.md)** | Caching strategies and implementation |
| **[CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md)** | Cloudflare Tunnel configuration |
| **[AWS_MIGRATION.md](AWS_MIGRATION.md)** | AWS deployment and migration |

### Other Resources

- **[Stack Diagram.excalidraw.md](Stack%20Diagram.excalidraw.md)** - Visual architecture diagrams
- **[Wireframes.excalidraw.md](Wireframes.excalidraw.md)** - UI/UX wireframes

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

## Navigation by Role

### For New Team Members

1. Read this README to understand the big picture
2. Review [decisions/01_project_choice.md](decisions/01_project_choice.md) to see why we chose this project
3. Study [decisions/02_tech_stack.md](decisions/02_tech_stack.md) to understand tech choices
4. Follow [../SETUP.md](../SETUP.md) to set up your local environment
5. Read [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for coding workflow

### For Academic Assessors

1. [REQUIREMENTS.md](REQUIREMENTS.md) - Formal requirements specification
2. [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture and design
3. [decisions/01_project_choice.md](decisions/01_project_choice.md) - Decision-making process
4. [decisions/02_tech_stack.md](decisions/02_tech_stack.md) - Technology justification

### For DevOps/Deployment

1. [DEPLOYMENT.md](DEPLOYMENT.md) - Complete deployment guide with checklist
2. [CLOUDFLARE_TUNNEL.md](CLOUDFLARE_TUNNEL.md) - Tunnel configuration
3. [AWS_MIGRATION.md](AWS_MIGRATION.md) - AWS deployment strategy

### For Understanding Specific Features

- **Multilingual Support:** [decisions/03_database_design.md](decisions/03_database_design.md)
- **Recommendations:** [decisions/04_recommendation_system.md](decisions/04_recommendation_system.md)
- **Caching:** [guides/redis_caching.md](guides/redis_caching.md)
- **Database Schema:** [decisions/03_database_design.md](decisions/03_database_design.md)

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
│   ├── decisions/             # Architecture decision records
│   ├── guides/                # Implementation guides
│   ├── REQUIREMENTS.md        # Formal SRS
│   ├── ARCHITECTURE.md        # System design
│   ├── DEVELOPMENT_GUIDE.md   # Dev workflow
│   └── DEPLOYMENT.md          # Deployment guide
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
   - Decision rationale → `docs/decisions/`
   - Implementation guides → `docs/guides/`

2. **Follow naming conventions:**
   - Core docs: `UPPERCASE.md`
   - Decisions: `##_descriptive_name.md`
   - Guides: `lowercase_with_underscores.md`

3. **Update this README** if adding a new core document

4. **Add cross-references** to related documents

5. **Include "Last Updated" date** at the bottom of your document

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
- See decision docs in `decisions/`

**For Team Coordination:**
- Contact Semyon (Project Manager)

---

**Last Updated:** 2025-01-25
**Maintained By:** Semyon (Project Manager)
**Version:** 3.0 (Consolidated refactoring)
