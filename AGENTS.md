# AGENTS.md

Agent guidelines for agentic coding in the OghmaNotes repository.

## Quick Reference

**Project**: Next.js 16 full-stack app (React 19 frontend + Node.js API) with PostgreSQL  
**Tech Stack**: Lexical editor, Zustand state, Tailwind CSS 4, Prisma ORM, ESLint 9 (flat config)  
**Language Mix**: JavaScript/TypeScript (gradual migration)

## Build & Development

```bash
# Development
npm run dev                    # Next.js dev server (localhost:3000)
npm run build                  # Production build
npm start                      # Run built app

# Linting & Formatting (CI/CD gated)
npm run lint                   # ESLint check (fails build if errors)
# No prettier command; Prettier auto-formats on save

# Database
npm run db:generate            # Required after schema changes
npm run db:migrate             # Create migration + apply (dev only)
npm run db:migrate:deploy      # Apply migrations (production)
npm run db:reset               # ⚠️ Destructive - resets database
```

## Testing Protocol

**No automated tests exist.** Manual testing required per PR template:

1. **Happy path**: Core functionality works end-to-end
2. **Error cases**: Graceful handling of invalid inputs, network failures
3. **Security checklist**: Auth patterns, input validation, SQL injection prevention

Run the app (`npm run dev`), test features manually, document in PR.

## Code Style & Patterns

### Naming Conventions
- **Files**: `kebab-case.js` / `kebab-case.tsx`
- **React components**: `PascalCase`
- **Functions/variables**: `camelCase`
- **Constants**: `UPPERCASE_SNAKE_CASE`
- **Database columns**: `snake_case` (e.g., `user_id`, `created_at`)
- **UUID fields**: Import from `/src/lib/uuid-validation.js` (prevents nanoid issues)

### TypeScript & Imports
- Mix of `.js` and `.ts` files (gradual migration)
- Config: Strict null checks enabled, path alias `@/*` → `./src/*`
- Imports: Use path alias for project files
  ```ts
  import { auth } from '@/lib/auth'
  import UserPanel from '@/components/UserPanel'
  ```

### JSDoc & Comments
- **All exported functions** must have JSDoc block comment
- Security-sensitive code (auth, validation, DB) requires security note in JSDoc
- Line comments explain *why*, not *what*

```js
/**
 * Authenticates user credentials with rate limiting and account lockout.
 * 
 * Security: Passwords hashed with bcryptjs; rate limited to prevent brute force.
 */
export async function loginUser(email, password) { ... }
```

### Error Handling
- Always use try-catch in API routes
- Return explicit HTTP status codes (400 bad input, 401 unauth, 403 forbidden, 500 server error)
- Never expose stack traces to client
- Log errors internally but send sanitized messages

```js
try {
  // operation
} catch (error) {
  console.error('Database error:', error)
  return NextResponse.json({ error: 'Database operation failed' }, { status: 500 })
}
```

### Security Patterns
- **Database**: Parameterized queries only (Prisma handles this)
- **Auth**: JWT tokens in httpOnly cookies; rate limiting + account lockout
- **Input**: Validate with `validateAuthCredentials()` or schema validators
- **Passwords**: Hash with bcryptjs (never store plaintext)
- **No console.log** in production code (dev is OK)

### Formatting
- **Prettier**: Defaults (2-space indent, 80-char line length)
- **ESLint**: Flat config in `eslint.config.mjs`
  - React Hooks rules enforced (`react-hooks/recommended`)
  - Unused vars: warning (not error)
  - No-console: off (allowed)
- **Tailwind CSS**: Semantic color variables in CSS (theme-aware)

## Common Workflows

### Adding an API Endpoint
1. Create file: `src/app/api/[resource]/route.js`
2. Use `NextResponse` for responses
3. Check auth: `const { user } = await getSession(request)`
4. Validate input: Use validation functions from `@/lib/validation`
5. Use parameterized Prisma queries
6. Return proper status codes + error messages

### Database Schema Changes
1. Edit `prisma/schema.prisma`
2. Run: `npm run db:generate`
3. Run: `npm run db:migrate` (creates migration + applies)
4. Test locally before pushing

### Adding React Component
1. File: `src/components/ComponentName.tsx` (PascalCase)
2. Export default or named export
3. Use Tailwind CSS classes
4. Add JSDoc for complex props

## Ignored Paths (ESLint)
`node_modules`, `.next`, `out`, `build`, `public`, `next-env.d.ts`, `.archive`

## CI/CD
- GitHub Actions workflow checks `npm run lint` on all PRs
- Deployment to AWS Amplify from `prod` branch
- Database migrations must be applied before deploying

## References
- API endpoints: `/docs/API_ENDPOINTS.md`
- Database schema: `/docs/DATABASE_SCHEMA.md`
- Setup & deployment: `/SETUP.md`
- PR template checklist: `.github/pull_request_template.md`
