# Setup

Getting this running on your machine.

## What you need
- Node.js 18+
- PostgreSQL running

## Quick setup

```bash
# 1. Install stuff
npm install

# 2. Create the database
createdb socsboard
```

```sql
-- 3. Run this in psql (or pgAdmin, whatever)
CREATE TABLE public.login (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

```bash
# 4. Make a .env.local file with this:
DATABASE_URL=<redacted>JWT_SECRET=<redacted>
# 5. Start it
npm run dev
```

Open http://localhost:3000 and you should be good.

## If it breaks
- Database error? Make sure PostgreSQL is running
- Missing env vars? Check your `.env.local` file exists
- Still broken? Restart the dev server

