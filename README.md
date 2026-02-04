# SocsBoard

**University Society Platform - CT216 Software Engineering Project**

A full-stack social platform connecting university students with society events and content through personalized recommendations, featuring multilingual support (Irish + English).

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

**Complete documentation is in the [`docs/`](docs/) folder:**

- **[docs/README.md](docs/README.md)** - Documentation index and navigation guide
- **[SETUP.md](SETUP.md)** - Local development setup
- **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** - Production deployment guide
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** - System architecture and design
- **[docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)** - Formal requirements specification

### Documentation Structure

```
docs/
├── README.md                    # Documentation hub (start here)
├── ARCHITECTURE.md              # System design
├── REQUIREMENTS.md              # Formal SRS
├── DEVELOPMENT_GUIDE.md         # Dev workflow
├── DEPLOYMENT.md                # Deployment guide
├── decisions/                   # Architecture decision records
│   ├── 01_project_choice.md    # Why this project
│   ├── 02_tech_stack.md        # Technology rationale
│   ├── 03_database_design.md   # Database decisions
│   └── 04_recommendation_system.md # Algorithm design
└── guides/                      # Implementation guides
    ├── redis_caching.md         # Caching strategies
    ├── cloudflare_setup.md      # Cloudflare Tunnel
    └── aws_migration.md         # AWS deployment
```

---

## [x] Current Status

**Phase:** Active development

**Completed:**
- [x] User registration with email/password
- [x] Login with JWT authentication
- [x] Password hashing (bcrypt)
- [x] Session management with HTTP-only cookies
- [x] PostgreSQL database integration
- [x] Docker containerization
- [x] Bootstrap UI framework
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

- **Frontend:** Next.js 16 (App Router), React 19, Bootstrap 5
- **Backend:** Next.js API Routes, JWT authentication
- **Database:** PostgreSQL
- **Auth:** JWT + bcrypt
- **DevOps:** Docker, GitHub Actions
- **Deployment:** Cloudflare Tunnel (current), AWS (planned)

**Why these choices?** See [docs/decisions/02_tech_stack.md](docs/decisions/02_tech_stack.md)

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

## Docker Deployment

### Quick Deploy

```bash
# 1. Set up environment
cp .env.production.template .env
# Edit .env with your production credentials

# 2. Start containers
docker compose up -d

# 3. Verify
docker logs ct216_web
```

### Cloudflare Tunnel

To expose the app via `https://your-domain.com`:

1. See [docs/guides/cloudflare_setup.md](docs/guides/cloudflare_setup.md) for tunnel configuration
2. Or follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for complete deployment guide

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
- **Architecture questions:** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Documentation:** Browse [docs/README.md](docs/README.md)

---

## Project Info

**Module:** CT216 - Software Engineering I
**Team Size:** 4 members
**Duration:** 8 weeks development
**Status:** Active development

---

**Last Updated:** 2025-01-31
**Version:** 3.1 (Merged with template repository)
