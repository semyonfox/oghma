# SocsBoard

Student event platform for our CT216 project. Right now it's just login/register working.

**Quick Deployment:** See [docs/QUICKSTART.md](docs/QUICKSTART.md) for fast ct2106 stack integration  
**Setup:** See [SETUP.md](SETUP.md)  
**Roadmap:** See [docs/Plan.md](docs/Plan.md)

## Documentation map

- [`SETUP.md`](SETUP.md) – Full local development instructions plus environment guidance
- [`docs/QUICKSTART.md`](docs/QUICKSTART.md) – Five-minute checklist to get the Docker app online
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) – Canonical production guide (env, DB, Cloudflare, troubleshooting)
- [`docs/CLOUDFLARE_TUNNEL.md`](docs/CLOUDFLARE_TUNNEL.md) – Tunnel-specific steps and token reference
- [`DEPLOYMENT_CHECKLIST.md`](DEPLOYMENT_CHECKLIST.md) – Sign-off list for releases

## Development setup

```bash
npm install                   # install dependencies
cp .env.example .env.local    # tweak for your local database
npm run dev                   # start Next.js (http://localhost:3000)
```

Need a Postgres instance? The schema for the `login` table lives in `database/setup.sql`. Update `DATABASE_URL` in
`.env.local` to point at your database before running `npm run dev`.

## What works

- ✅ Register with email/password
- ✅ Login with JWT auth
- ✅ Password hashing (bcrypt)
- ✅ Session cookies
- ✅ PostgreSQL database

## Tech stack

- Next.js 16 (App Router)
- React 19
- PostgreSQL
- JWT + bcrypt

## Project structure

```
src/
├── app/
│   ├── page.js              # Homepage
│   ├── login/page.js        # Login page
│   ├── register/page.js     # Register page
│   └── api/auth/            # Auth endpoints
├── lib/                     # Utility functions
├── database/                # PostgreSQL setup
└── context/                 # React context (not used yet)
```

## API endpoints

**POST /api/auth/register**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

**POST /api/auth/login**

```json
{
  "email": "user@example.com",
  "password": "SecurePass123"
}
```

## Commands

```bash
npm run dev    # Start dev server
npm run build  # Build for production
npm run lint   # Check code
```

## Docker Deployment

Production images are built with the included multi-stage `Dockerfile`. For day-to-day use:

1. Copy `.env.production.template` to `.env` and fill in the secrets (the shared `socsboard_user` account is already
   wired up)
2. Run `docker compose up -d` to build and start `ct216_web`
3. Follow the Cloudflare steps in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md#cloudflare-tunnel) to expose
   `https://your-domain.com`

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for verification, maintenance, and troubleshooting details.
