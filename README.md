# SocsBoard → AI Learning Platform

**AI-Enhanced Study & Learning Hub**

A full-stack platform designed for university students to organize notes, collaborate on study materials, and leverage AI assistance for learning—built on secure multi-user authentication and cloud storage.

**Status:** Pivoting from society platform to AI learning platform (February 2025)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env.local
# Edit .env.local with your database credentials

# 3. Start development server
npm run dev
```

**Visit:** `http://localhost:3000`

For detailed setup instructions, see [SETUP.md](SETUP.md)

---

## Documentation

**Start here based on your role:**

- **New to the team?** → [docs/TEAM_GUIDE.md](docs/TEAM_GUIDE.md) - Onboarding guide
- **Setting up locally?** → [SETUP.md](SETUP.md) - Dev environment setup
- **Ready to code?** → [docs/DEVELOPMENT_PATTERNS.md](docs/DEVELOPMENT_PATTERNS.md) - Code patterns & examples
- **Building a feature?** → [docs/API_SPECS.md](docs/API_SPECS.md) - What to build
- **Deploying to AWS?** → [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Production deployment

**Complete documentation:** [docs/README.md](docs/README.md) - Full index and navigation

### Documentation Structure

```
docs/
├── README.md                    # Documentation hub (start here)
├── ARCHITECTURE.md              # System design
├── DECISIONS.md                 # Architecture decisions summary
├── REQUIREMENTS.md              # Formal SRS
├── DEVELOPMENT_GUIDE.md         # Dev workflow
├── DEPLOYMENT.md                # AWS deployment guide
├── guides/                      # Implementation guides
│   └── redis_caching.md         # Caching strategies
└── archive/                     # Historical research and decision records
    ├── decisions/               # Detailed decision analysis
    ├── 2025-02-AWS_MIGRATION_RESEARCH.md
    └── Stack_Diagram.excalidraw.md
```

---

## [x] Current Status

**Phase:** Active development

**Completed:**
- [x] User registration with email/password
- [x] Login with JWT authentication
- [x] Password hashing (bcrypt)
- [x] Session management with HTTP-only cookies
- [x] MariaDB database integration (migrated from PostgreSQL)
- [x] Docker containerization
- [x] Tailwind CSS framework (migrated from Bootstrap)
- [x] Template UI components (auth, calendar, landing page)
- [x] Merged with template repository

**In Progress:**
- User dashboard and profile pages
- Protected routes and authorization
- Events system (CRUD operations)

**Next Up:**
- Event registration and attendance
- Social posts feed
- Recommendation engine
- Multilingual support (Irish/English)
- AWS deployment

---

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS 4
- **Backend:** Next.js API Routes, JWT authentication
- **Database:** MariaDB 11+ (native vector support for AI features)
  - _Migrating from PostgreSQL for superior vector performance_
- **Auth:** JWT + bcrypt
- **DevOps:** Docker, GitHub Actions
- **Deployment:** Cloudflare Tunnel (current), AWS (planned)

**Why these choices?** See [docs/DECISIONS.md](docs/DECISIONS.md)

**Why MariaDB over PostgreSQL?**
- Native vector operations for AI/ML embeddings (faster than pgvector)
- Better performance for recommendation system
- Stores relational data identically to PostgreSQL
- See [docs/MARIADB_MIGRATION.md](docs/MARIADB_MIGRATION.md) for migration details

---

## Development

### Project Structure

```
ct216_project/
├── src/
│   ├── app/
│   │   ├── api/auth/           # Authentication API endpoints
│   │   ├── login/              # Login page
│   │   ├── register/           # Registration page
│   │   └── page.js             # Homepage
│   ├── lib/                    # Utility functions (auth, DB)
│   ├── components/             # Reusable UI components
│   │   ├── auth/              # Auth form templates
│   │   └── ui/                # UI component templates
│   └── database/               # Database setup and schema
├── docs/                        # Documentation
├── database/                    # SQL schema files
├── docker-compose.yml          # Docker configuration
└── Dockerfile                  # Container definition
```

### API Endpoints

**Authentication:**
- `POST /api/auth/register` - Create new user account
- `POST /api/auth/login` - Authenticate and get JWT token

**Planned:**
- `GET /api/events` - List events
- `POST /api/events` - Create event (authenticated)
- `GET /api/events/[id]` - Event details
- `POST /api/events/[id]/register` - Register for event

### Commands

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Build for production
npm run lint     # Run ESLint
npm run start    # Start production server
```

---

## AWS Deployment

This project is deployed to AWS using Amplify for the Next.js frontend and Lambda for the Python recommendation service.

**Production Setup:**
1. **Frontend (Next.js)** → AWS Amplify Hosting (SSR, CDN, CI/CD)
2. **Recommender API (Python)** → AWS Lambda (serverless, auto-scaling)
3. **Database (MariaDB)** → AWS RDS for MariaDB (managed, native vector support)
4. **Cache (Redis)** → ElastiCache (managed Redis)

**Full deployment guide:** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

### Why This Architecture?

- **Amplify for frontend:** Native Next.js SSR support, automatic CI/CD from GitHub
- **Lambda for recommender:** Python ML ecosystem, independent scaling, pay-per-use
- **Serverless benefits:** Auto-scaling, no server management, cost-effective

---

## Local Development

For local development with Docker Compose:

### Quick Start

```bash
# 1. Set up environment
cp .env.example .env.local
# Edit .env.local with your database credentials

# 2. Start development server
npm install
npm run dev
```

**Visit:** `http://localhost:3000`

For detailed setup instructions, see [SETUP.md](SETUP.md)

---

## Database Schema

**Current:**

```sql
CREATE TABLE login (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Planned:** See [database/setup.sql](database/setup.sql) for complete schema including events, registrations, and society tables.

---

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Test locally: `npm run dev`
4. Commit: `git commit -m "feat: add your feature"`
5. Push: `git push origin feature/your-feature`
6. Open a pull request

See [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) for complete development workflow.

---

## Need Help?

- **Setup issues:** Check [SETUP.md](SETUP.md)
- **Deployment:** See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Architecture questions:** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) or [docs/DECISIONS.md](docs/DECISIONS.md)
- **Documentation:** Browse [docs/README.md](docs/README.md)

---

## Project Info

**Module:** CT216 - Software Engineering I
**Team Size:** 4 members
**Duration:** 8 weeks development
**Status:** Active development (Pivot to AI Learning Platform)

---

## Acknowledgments & Attribution

### Notea
This project builds on architectural patterns and components from [**Notea**](https://github.com/notea-org/notea), an open-source markdown note-taking app.

**What we extracted from Notea:**
- S3-compatible storage provider (abstraction layer)
- Rich markdown editor (ProseMirror-based)
- File tree / sidebar UI (hierarchical note browser)
- State management patterns (unstated-next containers)
- Internationalization system (rosetta-based, 9 languages)
- Sharing infrastructure (public note templates)

**License:** Notea is licensed under the MIT License. See [ATTRIBUTION.md](docs/ATTRIBUTION.md) for full details and attribution.

We are grateful to [@qingwei-li](https://github.com/qingwei-li) and the Notea community for this clean, well-architected codebase.

---

**Last Updated:** February 14, 2025
**Version:** 5.0 (AI Platform Pivot)
