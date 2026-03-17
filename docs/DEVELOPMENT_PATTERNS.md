# Development Patterns - Code Examples & Standards

This guide shows you exactly how to write code that fits the SocsBoard style. Copy these patterns.

**Reference implementation:** `src/app/api/auth/login/route.ts`

---

## Pattern 1: Creating an API Endpoint

All endpoints follow this structure.

### File: `src/app/api/[feature]/[action]/route.ts`

```javascript
import { validateEmail } from '@/lib/validation';
import { createErrorResponse, createValidationErrorResponse } from '@/lib/auth';
import sql from '@/database/pgsql';

/**
 * POST /api/[feature]/[action]
 * Purpose: Clear description of what this endpoint does
 * Security: Notes on validation, auth requirements, rate limiting
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { email, name } = body;

    // Validate input
    if (!email || !name) {
      return createValidationErrorResponse('Missing required fields');
    }

    if (!validateEmail(email)) {
      return createValidationErrorResponse('Invalid email format');
    }

    // Check if already exists
    const existing = await sql`
      SELECT user_id FROM login WHERE email = ${email}
    `;

    if (existing.length > 0) {
      return createValidationErrorResponse('Email already registered');
    }

    // Perform action
    const result = await sql`
      INSERT INTO some_table (email, name, created_at)
      VALUES (${email}, ${name}, NOW())
      RETURNING id, email, name, created_at
    `;

    return Response.json(
      {
        success: true,
        data: {
          id: result[0].id,
          email: result[0].email,
          name: result[0].name,
          createdAt: result[0].created_at,
        },
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Operation failed:', error);
    return createErrorResponse('Operation failed', 500);
  }
}
```

### Key Points

✅ **Do this:**
- Validate all inputs upfront
- Use parameterized queries
- Return consistent response format
- Include JSDoc comment
- Catch errors and return 500

❌ **Don't do this:**
- Trust user input
- Concatenate SQL strings
- Forget error handling

---

## Pattern 2: Input Validation

```javascript
import { validateEmail, isValidPassword } from '@/lib/validation';

export async function POST(request) {
  const { email, password } = await request.json();

  if (!validateEmail(email)) {
    return createValidationErrorResponse('Invalid email format');
  }

  if (!isValidPassword(password)) {
    return createValidationErrorResponse('Password must be 8+ chars');
  }

  // Continue...
}
```

---

## Pattern 3: Database Queries

Always use parameterized queries:

```javascript
// SELECT
const users = await sql`
  SELECT user_id, email FROM login WHERE email = ${email}
`;

// INSERT
const result = await sql`
  INSERT INTO events (title, capacity) VALUES (${title}, ${capacity})
  RETURNING id
`;

// UPDATE
await sql`
  UPDATE events SET title = ${newTitle} WHERE id = ${eventId}
`;

// DELETE
await sql`
  DELETE FROM events WHERE id = ${eventId} AND user_id = ${userId}
`;
```

---

## Pattern 4: Error Responses

```javascript
// Success (200)
return Response.json({ success: true, data: {...} });

// Created (201)
return Response.json({ success: true, data: {...} }, { status: 201 });

// Validation error (400)
return createValidationErrorResponse('Invalid input');

// Not found (404)
return createErrorResponse('Not found', 404);

// Unauthorized (401)
return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

// Server error (500)
return createErrorResponse('Operation failed', 500);
```

---

## Pattern 5: Authentication

```javascript
import { verifyToken } from '@/lib/auth';

export async function GET(request) {
  const cookieHeader = request.headers.get('cookie') || '';
  const tokenMatch = cookieHeader.match(/authToken=([^;]+)/);

  if (!tokenMatch) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = tokenMatch[1];
  const user = await verifyToken(token);
  const userId = user.user_id;

  // Continue with authenticated operation
}
```

---

## Pattern 6: List with Pagination

```javascript
export async function GET(request) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');

  const offset = (page - 1) * limit;
  const countResult = await sql`SELECT COUNT(*) as total FROM events`;
  const total = countResult[0].total;

  const events = await sql`
    SELECT id, title FROM events
    LIMIT ${limit} OFFSET ${offset}
  `;

  return Response.json({
    success: true,
    data: events,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  });
}
```

---

## Naming Conventions

- Database tables: `events`, `event_registrations` (snake_case, plural)
- Columns: `user_id`, `created_at` (snake_case)
- API routes: `/api/user-profiles` (kebab-case)
- Functions: `validateEmail()` (camelCase)
- Constants: `MAX_ATTEMPTS` (UPPER_SNAKE_CASE)

---

## Testing

```bash
# Test endpoint
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"title":"Tech Meetup"}'

# Lint before committing
npm run lint
```

---

## Checklist Before Committing

- [ ] Follows reference implementation pattern
- [ ] All inputs validated
- [ ] Error handling in place
- [ ] Parameterized queries (no concatenation)
- [ ] JSDoc comment added
- [ ] No console.log statements
- [ ] Passes linting

---

**Last Updated:** Feb 6, 2026
