# Team Guide - Getting Started with SocsBoard

Welcome to the SocsBoard development team! This guide helps you get up and running quickly.

**Time to start coding:** ~1 hour after setup

---

## 1. Before You Write Any Code

### Understand What We're Building

Read these in order (20 minutes total):

1. **[Project Overview](README.md#project-overview)** - What is SocsBoard?
2. **[Requirements](REQUIREMENTS.md)** (first section only) - What are we actually building?
3. **[Architecture](ARCHITECTURE.md)** (system design section) - How does it all fit together?
4. **[Tech Stack](02_tech_stack.md)** - Why Next.js, PostgreSQL, etc.?

**Key concept:** We're building a university society discovery platform with personalized event recommendations.

### Know Your Role & Timeline

Check **[PROJECT_PLAN.md](../PROJECT_PLAN.md)** to see:
- What phase we're in (currently Phase 2: Events)
- Your assigned epic/feature (check the TEAM ASSIGNMENTS table)
- Success metrics for this week
- Blockers that might affect your work

---

## 2. Setup (30 minutes)

Follow setup steps:

```bash
# 1. Clone and install
git clone <repo>
cd socsboard
npm install

# 2. Create .env file
cp .env.example .env.local
# Ask Semyon for DATABASE_URL if you don't have a local PostgreSQL

# 3. Start dev server
npm run dev
# Visit http://localhost:3000
```

**Stuck?** Ask Semyon.

---

## 3. Understand the Code Patterns

### Read the Reference Implementation

Before writing any endpoint, read:
- **`src/app/api/auth/login/route.ts`** - This is the pattern to copy
- **[DEVELOPMENT_PATTERNS.md](DEVELOPMENT_PATTERNS.md)** - Detailed breakdown of that pattern

Key things to notice:
1. **Validation** - Always validate input using `lib/validation.js`
2. **Error handling** - Use response helpers from `lib/auth.js`
3. **Comments** - Include JSDoc explaining what the endpoint does
4. **Security** - Note any auth requirements or security considerations

### Run Existing Endpoints to Understand Flow

Test the working endpoints:

```bash
# Register a user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123!"}'
```

This is exactly what your new endpoints should do.

---

## 4. Know Where Everything Is

### Key Files You'll Touch

| What | Where | Why |
|------|-------|-----|
| Create API endpoints | `src/app/api/[feature]/route.ts` | All backend logic |
| Validate user input | `src/lib/validation.js` | Prevent bad data |
| Database queries | `src/database/pgsql.js` | Connect to PostgreSQL |
| API specs | `docs/API_SPECS.md` | Know exactly what to build |
| Database schema | `database/schema.sql` | Understand tables |
| Styling | `src/app/globals.css` + Tailwind classes | Make it look good |

### Documentation You'll Reference Constantly

- **[API_SPECS.md](API_SPECS.md)** - Your feature spec (read this first!)
- **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - All tables and relationships
- **[DEVELOPMENT_PATTERNS.md](DEVELOPMENT_PATTERNS.md)** - Code patterns to copy
- **[GLOSSARY.md](../GLOSSARY.md)** - Technical term definitions

---

## 5. Your First Task

### For Everyone

1. **Pick your feature** from [PROJECT_PLAN.md](../PROJECT_PLAN.md) or ask Semyon
2. **Read the API spec** in [API_SPECS.md](API_SPECS.md)
3. **Create a branch:** `git checkout -b feature/your-feature-name`
4. **Build the feature** following [DEVELOPMENT_PATTERNS.md](DEVELOPMENT_PATTERNS.md)
5. **Test it works** (instructions in the spec)
6. **Submit a PR** (GitHub will show the PR template automatically)

### Example: Building POST /api/events

```bash
# 1. Read the spec
less docs/API_SPECS.md  # Find "POST /api/events" section

# 2. Look at the pattern
cat src/app/api/auth/register/route.ts # Copy this structure

# 3. Create your file
touch src/app/api/events/route.ts

# 4. Write the endpoint (reference the pattern)
# Remember: validate → query → respond

# 5. Test it
npm run dev
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{...test data...}'

# 6. Push and make PR
git add .
git commit -m "feat: implement POST /api/events endpoint"
git push origin feature/events-crud
# Then create PR on GitHub
```

---

## 6. How We Work Together

### Code Reviews & Feedback

When you submit a PR:

1. **GitHub Actions** runs linting automatically
   - If it fails, fix the issues and push again
   - No merge until it passes

2. **Semyon reviews** your code (usually same day)
   - Checks for security issues
   - Verifies it matches the spec
   - Requests changes if needed

3. **You address feedback** (5-10 min usually)

4. **Merge to main** when approved

### Communication

- **Quick questions?** Post in team chat
- **Stuck for >15 min?** Ask Semyon (don't silently struggle)
- **Found a bug?** Create a GitHub issue and mention it in chat
- **Finished early?** Check TODO.md for next task

### Code Standards

**We enforce these automatically:**
- ESLint (run `npm run lint`)
- Consistent naming conventions
- Security checklist in PR template

**We enforce these via review:**
- Comments explaining complex logic
- Error handling for edge cases
- Input validation on all user-facing endpoints

---

## 7. Weekly Sync

Every [day/week], we check:
- What you shipped this week
- What's blocking you
- Adjust assignments if needed

Check **[TECH_LEAD_GUIDE.md](TECH_LEAD_GUIDE.md)** to see what Semyon is tracking.

---

## 8. Common Questions

### "I don't understand the API spec"

1. Re-read the spec section (usually very clear)
2. Look at similar endpoints (reference implementation)
3. Check [DEVELOPMENT_PATTERNS.md](DEVELOPMENT_PATTERNS.md)
4. Ask Semyon (that's what he's for)

### "Where do I put this code?"

- **API endpoints?** `src/app/api/[feature]/route.ts`
- **Reusable logic?** `src/lib/[feature].js`
- **Database queries?** In the endpoint or `src/database/pgsql.js`
- **UI components?** `src/components/[feature]/` (eventually)

### "How do I test my changes?"

```bash
npm run dev  # Start dev server
npm run lint # Check code style
# Manual testing: use curl or Postman for API endpoints
```

We don't have automated tests yet (see TODO.md).

### "I broke the database"

Don't panic! Everyone does this:

1. Check `database/schema.sql` - see what should be there
2. Drop and recreate if needed (dev environment only!)
3. Re-run the schema setup
4. Ask Semyon if you're stuck

### "How do I get a local database?"

You have options:
- Local PostgreSQL installation
- Docker container
- Remote database via Tailscale (ask Semyon for credentials)

---

## 9. Next Steps

1. **Complete setup**
2. **Read your feature spec** (API_SPECS.md)
3. **Study the pattern** (reference endpoint + DEVELOPMENT_PATTERNS.md)
4. **Create your branch** and start coding
5. **Ask if stuck** (better to ask than delay)

---

## Quick Links

| What You Need | Where to Find It |
|--------------|------------------|
| Setup instructions | Check the README |
| What to build | [API_SPECS.md](API_SPECS.md) |
| How to code it | [DEVELOPMENT_PATTERNS.md](DEVELOPMENT_PATTERNS.md) |
| Database schema | [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) |
| System design | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Current blockers | [TODO.md](../TODO.md) |
| Weekly timeline | [PROJECT_PLAN.md](../PROJECT_PLAN.md) |
| Definitions | [GLOSSARY.md](../GLOSSARY.md) |

---

**Welcome to the team! Let's ship this. 🚀**

Last Updated: Feb 6, 2026
