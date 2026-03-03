# SocsBoard

Student event platform for our CT216 project. Right now it's just login/register working.

**Setup:** See [SETUP.md](SETUP.md)  
**Roadmap:** See [docs/Plan.md](docs/Plan.md)

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
{ "email": "user@example.com", "password": "SecurePass123" }
```

**POST /api/auth/login**
```json
{ "email": "user@example.com", "password": "SecurePass123" }
```

## Commands
```bash
npm run dev    # Start dev server
npm run build  # Build for production
npm run lint   # Check code
```

