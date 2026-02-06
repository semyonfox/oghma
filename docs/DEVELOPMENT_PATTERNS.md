# Development Patterns Guide

**Purpose:** Show how to structure API endpoints. Copy these patterns for consistency.

**Reference Implementation:** `/src/app/api/auth/login/route.js`

---

## API Endpoint Structure

All endpoints follow this pattern:

```javascript
/**
 * Route Description
 *
 * Purpose: Why does this endpoint exist?
 * Security: What permissions/checks are needed?
 * Used by: Who calls this?
 */

import { helpers } from '@/lib/...';
import sql from '@/database/pgsql.js';

/**
 * HTTP_METHOD /api/route
 *
 * What does it do?
 *
 * @param {Request} request - Next.js request
 * @returns {Response} JSON with success/error
 */
export async function POST(request) {
    try {
        // 1. Parse and validate input
        // 2. Check authorization
        // 3. Query database
        // 4. Validate business logic
        // 5. Write to database
        // 6. Return response

        return createSuccessResponse({ data });
    } catch (error) {
        return createErrorResponse('Clear error message', 500);
    }
}
```

---

## Example: POST /api/events

**File:** `/src/app/api/events/route.js`

```javascript
/**
 * Events Route Handler
 *
 * Purpose: Create and list events.
 * Security: POST requires authentication, user must be society admin.
 * Used by: Frontend event creation form, event discovery page.
 */

import sql from '@/database/pgsql.js';
import { validateSession } from '@/lib/auth.js';
import {
    createSuccessResponse,
    createErrorResponse,
    createValidationErrorResponse,
    parseJsonBody
} from '@/lib/auth.js';

/**
 * POST /api/events
 *
 * Create a new event. Only society admins can create events.
 *
 * @param {Request} request - HTTP request with event data in body
 * @returns {Response} 201 with created event, or error
 */
export async function POST(request) {
    try {
        // 1. Parse and validate request body
        const { data: body, error: parseError } = await parseJsonBody(request);
        if (parseError) return parseError;

        const { title, description, event_date, event_time, location, capacity, image_url, category } = body;

        // 2. Validate user is authenticated
        const user = await validateSession();
        if (!user) {
            return createErrorResponse('Unauthorized - login required', 401);
        }

        // 3. Validate input fields
        const errors = {};

        // title: required, 1-255 chars
        if (!title || title.length < 1 || title.length > 255) {
            errors.title = 'Title required (1-255 characters)';
        }

        // event_date: required, must be future
        if (!event_date) {
            errors.event_date = 'Event date required';
        } else {
            const dateObj = new Date(event_date);
            if (isNaN(dateObj) || dateObj < new Date()) {
                errors.event_date = 'Event date must be a valid future date';
            }
        }

        // category: must be valid
        const validCategories = ['sports', 'music', 'tech', 'arts', 'games', 'social', 'academic', 'other'];
        if (category && !validCategories.includes(category)) {
            errors.category = `Category must be one of: ${validCategories.join(', ')}`;
        }

        // capacity: if provided, must be > 0
        if (capacity && capacity <= 0) {
            errors.capacity = 'Capacity must be greater than 0';
        }

        // image_url: if provided, must be HTTPS
        if (image_url && !image_url.startsWith('https://')) {
            errors.image_url = 'Image URL must use HTTPS';
        }

        // Return validation errors if any
        if (Object.keys(errors).length > 0) {
            return createValidationErrorResponse(errors);
        }

        // 4. Check authorization (user is society admin)
        // NOTE: For MVP, we're allowing any authenticated user to create events.
        // TODO: Add society admin check when RBAC is implemented.
        const society_id = 1; // TODO: Get from user's societies or request body

        // 5. Insert event into database
        const result = await sql`
            INSERT INTO public.events
            (society_id, title, description, event_date, event_time, location, capacity, image_url, category, status, created_by)
            VALUES
            (${society_id}, ${title.trim()}, ${description || null}, ${event_date}, ${event_time || null}, ${location || null}, ${capacity || null}, ${image_url || null}, ${category || null}, 'published', ${user.user_id})
            RETURNING event_id, title, event_date, created_at;
        `;

        const event = result[0];

        // 6. Return success response
        return createSuccessResponse(
            {
                event: {
                    event_id: event.event_id,
                    title: event.title,
                    event_date: event.event_date,
                    created_at: event.created_at
                }
            },
            201  // 201 Created status
        );

    } catch (error) {
        // Always catch errors and return generic message
        // Don't expose database errors to client
        return createErrorResponse('Failed to create event', 500);
    }
}

/**
 * GET /api/events
 *
 * List all published events, optionally filtered.
 *
 * @param {Request} request - HTTP request with query params
 * @returns {Response} 200 with events array
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page')) || 1;
        const limit = Math.min(parseInt(searchParams.get('limit')) || 20, 100);
        const category = searchParams.get('category');
        const society_id = searchParams.get('society_id');

        // Validate pagination
        if (page < 1 || limit < 1) {
            return createErrorResponse('Invalid pagination parameters', 400);
        }

        const offset = (page - 1) * limit;

        // Build dynamic query with filters
        let whereConditions = [`e.status = 'published'`, `e.event_date >= CURRENT_DATE`];
        const queryParams = [];

        if (category) {
            whereConditions.push(`e.category = $${queryParams.length + 1}`);
            queryParams.push(category);
        }

        if (society_id) {
            whereConditions.push(`e.society_id = $${queryParams.length + 1}`);
            queryParams.push(parseInt(society_id));
        }

        const whereClause = whereConditions.join(' AND ');

        // Query events with registration counts
        const events = await sql`
            SELECT
                e.event_id,
                e.title,
                e.event_date,
                e.event_time,
                e.location,
                e.capacity,
                e.category,
                e.image_url,
                s.society_id,
                s.name as society_name,
                COUNT(er.registration_id) as registered_count,
                COALESCE(e.capacity, 999999) - COUNT(er.registration_id) as remaining_capacity
            FROM public.events e
            JOIN public.societies s ON e.society_id = s.society_id
            LEFT JOIN public.event_registrations er ON e.event_id = er.event_id AND er.status = 'registered'
            WHERE ${sql.unsafe(whereClause)}
            GROUP BY e.event_id, s.society_id, s.name
            ORDER BY e.event_date ASC
            LIMIT ${limit} OFFSET ${offset};
        `;

        // Query total count (for pagination)
        const countResult = await sql`
            SELECT COUNT(*) as total
            FROM public.events e
            WHERE ${sql.unsafe(whereClause)};
        `;
        const totalCount = countResult[0].total;

        return createSuccessResponse({
            events,
            pagination: {
                page,
                limit,
                total: totalCount,
                pages: Math.ceil(totalCount / limit)
            }
        });

    } catch (error) {
        return createErrorResponse('Failed to fetch events', 500);
    }
}
```

---

## Pattern Checklist

When writing an endpoint, use this checklist:

### Structure
- [ ] File in correct location (`/src/app/api/...`)
- [ ] JSDoc comment explaining purpose + security
- [ ] Function signature: `export async function METHOD(request)`
- [ ] Try/catch wrapper around entire function

### Input Validation
- [ ] Parse request body with `parseJsonBody()`
- [ ] Validate all fields
- [ ] Check data types (string length, number range, date format)
- [ ] Return `createValidationErrorResponse()` if invalid

### Authorization
- [ ] Call `validateSession()` if auth required
- [ ] Check user has permission (admin, owner, etc.)
- [ ] Return 401 if not authenticated
- [ ] Return 403 if authenticated but not authorized

### Business Logic
- [ ] Check all constraints (capacity, duplicates, etc.)
- [ ] Query database with parameterized queries (use `$1, $2`, not string concat)
- [ ] Handle edge cases (no results, capacity full, etc.)

### Response
- [ ] Success: use `createSuccessResponse(data, 200)`
- [ ] Creation: use `createSuccessResponse(data, 201)`
- [ ] Error: use `createErrorResponse(message, statusCode)`
- [ ] Return HTTP status codes: 200, 201, 400, 401, 403, 404, 500

### Error Handling
- [ ] Catch all errors in try/catch
- [ ] Never expose database errors to client
- [ ] Log error in development (remove console.log in production)
- [ ] Return generic error message

---

## Response Format

### Success (200 / 201)
```json
{
  "success": true,
  "event": {
    "event_id": 1,
    "title": "Chess Tournament",
    "event_date": "2026-02-15"
  }
}
```

### Validation Error (400)
```json
{
  "success": false,
  "error": "Validation failed",
  "validationErrors": {
    "title": "Title is required",
    "event_date": "Event date must be in the future"
  }
}
```

### Unauthorized (401)
```json
{
  "success": false,
  "error": "Unauthorized - login required"
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": "Failed to create event"
}
```

---

## Database Query Pattern

**Always use parameterized queries:**

```javascript
// ✅ CORRECT - Safe from SQL injection
const result = await sql`
    INSERT INTO public.events (title, event_date, created_by)
    VALUES (${title}, ${event_date}, ${user.user_id})
    RETURNING event_id;
`;

// ❌ WRONG - SQL injection vulnerability
const result = await sql`
    INSERT INTO public.events (title, event_date, created_by)
    VALUES ('${title}', '${event_date}', ${user.user_id})
    RETURNING event_id;
`;
```

**The postgres library automatically parameterizes** - just use `${variable}` syntax.

---

## JSDoc Format

Document what the endpoint DOES and WHY, not just the signature:

```javascript
/**
 * POST /api/events
 *
 * Create a new event. Only society admins can create events.
 * Validates all inputs and checks authorization before inserting.
 *
 * @param {Request} request - HTTP request with event data
 * @returns {Response} 201 with created event object, or error
 */
export async function POST(request) {
    // ...
}
```

**Don't document:**
```javascript
/**
 * Parse the request body
 * Validate the title
 * Query the database
 */
```

Code is readable - document the INTENT.

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Forgetting Error Handling
```javascript
// BAD - If error occurs, crashes the server
const result = await sql`SELECT * FROM events`;
```

**FIX:**
```javascript
// GOOD
try {
    const result = await sql`SELECT * FROM events`;
} catch (error) {
    return createErrorResponse('Failed to fetch events', 500);
}
```

---

### ❌ Mistake 2: Exposing Database Errors
```javascript
// BAD - Tells attacker about your schema
catch (error) {
    return createErrorResponse(`Database error: ${error.message}`, 500);
}
```

**FIX:**
```javascript
// GOOD - Generic message, attacker learns nothing
catch (error) {
    return createErrorResponse('Server error', 500);
}
```

---

### ❌ Mistake 3: No Input Validation
```javascript
// BAD - Trusts client, allows garbage data
const title = body.title;
await sql`INSERT INTO events (title) VALUES (${title})`;
```

**FIX:**
```javascript
// GOOD - Validates before insert
if (!title || title.length < 1 || title.length > 255) {
    return createValidationErrorResponse({ title: 'Invalid' });
}
```

---

### ❌ Mistake 4: Forgetting Authorization
```javascript
// BAD - Anyone can delete anyone's events
export async function DELETE(request, { params }) {
    await sql`DELETE FROM events WHERE event_id = ${params.id}`;
}
```

**FIX:**
```javascript
// GOOD - Check user owns the event
const user = await validateSession();
if (!user) return createErrorResponse('Unauthorized', 401);

const event = await sql`SELECT created_by FROM events WHERE event_id = ${params.id}`;
if (event[0].created_by !== user.user_id) {
    return createErrorResponse('Forbidden', 403);
}

await sql`DELETE FROM events WHERE event_id = ${params.id}`;
```

---

## Testing Before Submitting PR

```bash
# 1. Run linting
npm run lint

# 2. Test manually with curl
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","event_date":"2026-02-15"}'

# 3. Test error cases
# - Missing required field
# - Invalid data type
# - Future date validation
# - Authorization (logged in vs logged out)

# 4. Check database
# - Was data actually inserted?
# - Are timestamps correct?
# - Are relationships correct?
```

---

## When Stuck

1. **Read the spec:** `docs/API_SPECS.md`
2. **Read the reference:** `/src/app/api/auth/login/route.js`
3. **Read the database schema:** `docs/DATABASE_SCHEMA.md`
4. **Check validation rules:** This document, "Common Mistakes" section
5. **Ask Semyon:** Reference the doc section and what you tried

---

## Summary

**Copy this template for every endpoint:**

1. JSDoc explaining purpose + security
2. Parse/validate input
3. Check authorization
4. Query database
5. Check business logic
6. Return response or error
7. Catch all errors

**Use response helpers:**
- `createSuccessResponse(data, status)`
- `createErrorResponse(message, status)`
- `createValidationErrorResponse(errors)`

**Always parameterize queries** with `${variable}`

**Test before submitting PR**

---

**Reference:** `/src/app/api/auth/login/route.js`
**Spec:** `docs/API_SPECS.md`
**Schema:** `docs/DATABASE_SCHEMA.md`
