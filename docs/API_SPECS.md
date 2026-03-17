# API Specifications

**Purpose:** Define all API endpoints that the team will build.
**Pattern Reference:** Follow the auth pattern in `/src/app/api/auth/login/route.ts`

---

## Events API

### Overview
Events are the core feature. Societies create events, students discover and register for them.

**Base:** `/api/events`

### Database Schema

```sql
CREATE TABLE public.events (
    event_id SERIAL PRIMARY KEY,
    society_id INTEGER NOT NULL REFERENCES public.societies(society_id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMP NOT NULL,
    event_time TIME,
    location VARCHAR(255),
    capacity INTEGER DEFAULT NULL,  -- NULL = unlimited
    image_url VARCHAR(500),
    category VARCHAR(100),  -- sports, music, tech, arts, etc.
    status VARCHAR(50) DEFAULT 'published',  -- published, draft, cancelled
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_events_society ON public.events(society_id);
CREATE INDEX idx_events_date ON public.events(event_date);
CREATE INDEX idx_events_category ON public.events(category);

CREATE TABLE public.event_registrations (
    registration_id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES public.events(event_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES public.login(user_id) ON DELETE CASCADE,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'registered',  -- registered, waitlist, cancelled
    UNIQUE(event_id, user_id)
);

CREATE INDEX idx_registrations_user ON public.event_registrations(user_id);
CREATE INDEX idx_registrations_event ON public.event_registrations(event_id);
```

---

## Endpoints

### 1. GET /api/events
**Purpose:** List all events (filtered, paginated)
**Auth:** Optional (works anonymous, but recommendations only for authenticated)
**Query Parameters:**
```
?page=1          // pagination (default: 1)
?limit=20        // per page (default: 20, max: 100)
?category=sports // filter by category
?society_id=5    // filter by society
?upcoming=true   // only future events (default: true)
?search=chess    // search title/description
```

**Response (200):**
```json
{
  "success": true,
  "events": [
    {
      "event_id": 1,
      "title": "Chess Tournament",
      "society_id": 5,
      "event_date": "2026-02-15",
      "event_time": "14:00",
      "location": "Library Room 101",
      "capacity": 32,
      "registered": 28,
      "remaining_capacity": 4,
      "image_url": "https://...",
      "category": "games",
      "status": "published"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150
  }
}
```

**Errors:**
- 400: Invalid query parameters (page not number, limit > 100)
- 500: Database error

---

### 2. GET /api/events/:id
**Purpose:** Get detailed event information
**Auth:** Optional
**Response (200):**
```json
{
  "success": true,
  "event": {
    "event_id": 1,
    "title": "Chess Tournament",
    "description": "Beginner-friendly tournament...",
    "society_id": 5,
    "society_name": "Chess Club",
    "event_date": "2026-02-15",
    "event_time": "14:00",
    "location": "Library Room 101",
    "capacity": 32,
    "registered": 28,
    "image_url": "https://...",
    "category": "games",
    "created_at": "2026-02-01T10:00:00Z",
    "created_by": "admin@chess-club.ie",
    "status": "published",
    "user_registered": false  // only if authenticated
  }
}
```

**Errors:**
- 404: Event not found
- 500: Database error

---

### 3. POST /api/events
**Purpose:** Create new event (society admin only)
**Auth:** Required (JWT token in cookie)
**Request:**
```json
{
  "title": "Chess Tournament",
  "description": "Beginner-friendly tournament",
  "event_date": "2026-02-15",
  "event_time": "14:00",
  "location": "Library Room 101",
  "capacity": 32,
  "category": "games",
  "image_url": "https://example.com/image.jpg"
}
```

**Validation:**
- title: required, 1-255 chars
- description: optional, max 5000 chars
- event_date: required, must be future date
- event_time: optional, HH:MM format
- location: optional
- capacity: optional, must be > 0 if provided
- category: must be in (sports, music, tech, arts, games, social, academic, other)

**Response (201):**
```json
{
  "success": true,
  "event": {
    "event_id": 42,
    "title": "Chess Tournament",
    "society_id": 5,
    "status": "published",
    "created_at": "2026-02-01T15:30:00Z"
  }
}
```

**Errors:**
- 400: Validation error (see validation errors response format)
- 401: Unauthorized (not logged in)
- 403: Forbidden (not society admin)
- 500: Database error

**Validation Error Response:**
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

---

### 4. PUT /api/events/:id
**Purpose:** Update event (society admin only)
**Auth:** Required
**Request:** Same as POST
**Response (200):** Updated event object
**Errors:**
- 400: Validation error
- 401: Unauthorized
- 403: Forbidden (not event creator or society admin)
- 404: Event not found
- 500: Database error

---

### 5. DELETE /api/events/:id
**Purpose:** Cancel event (society admin only)
**Auth:** Required
**Response (200):**
```json
{
  "success": true,
  "message": "Event cancelled"
}
```

**Errors:**
- 401: Unauthorized
- 403: Forbidden
- 404: Event not found
- 500: Database error

---

## Event Registration

### 6. POST /api/events/:id/register
**Purpose:** Register user for event
**Auth:** Required
**Request:**
```json
{}  // No body needed
```

**Response (201):**
```json
{
  "success": true,
  "registration": {
    "registration_id": 123,
    "event_id": 1,
    "user_id": 7,
    "status": "registered",
    "registered_at": "2026-02-01T15:45:00Z"
  }
}
```

**Errors:**
- 400: Already registered, capacity full (status: waitlist), event in past
- 401: Unauthorized
- 404: Event not found
- 500: Database error

**Logic:**
- Check if user already registered → 400 with "Already registered"
- Check if capacity full → 201 with status: "waitlist"
- Otherwise → 201 with status: "registered"

---

### 7. DELETE /api/events/:id/register
**Purpose:** Cancel registration
**Auth:** Required
**Response (200):**
```json
{
  "success": true,
  "message": "Registration cancelled"
}
```

**Errors:**
- 404: Not registered for this event
- 401: Unauthorized
- 500: Database error

---

## Response Format Pattern

All endpoints follow this pattern:

**Success (2xx):**
```json
{
  "success": true,
  "data": {}  // endpoint-specific data
}
```

**Error (4xx/5xx):**
```json
{
  "success": false,
  "error": "Human-readable message",
  "errorCode": "ERROR_CODE"  // optional, for client to handle
}
```

---

## Security & Validation

### For All Endpoints
1. **Input validation:** Check all user inputs
2. **SQL injection:** Use parameterized queries (postgres library)
3. **Authorization:** Check JWT token in cookie
4. **Rate limiting:** Use existing rateLimit.js utility (already in login)

### For Creation/Update
1. Validate all required fields
2. Trim whitespace
3. Check data types
4. Check date is in future (for events)
5. Check user is authorized (society admin)

---

## Implementation Notes

**Reference Implementation:** `/src/app/api/auth/login/route.ts`
- Use same response helpers: `createSuccessResponse()`, `createErrorResponse()`, etc.
- Use same validation pattern: `validateAuthCredentials()` approach
- Use same database pattern: `await sql\`...\`` with parameterized values

**JSDoc:** Document all functions with JSDoc explaining purpose and security
**Error Handling:** Always catch errors and return 500 with generic message
**Logging:** No console.log in production code

---

## Testing Checklist

When implementing, test:

- [ ] Create event (valid data)
- [ ] Create event (missing required field)
- [ ] Create event (invalid category)
- [ ] Create event (past date)
- [ ] Update event (as creator)
- [ ] Update event (not as creator) → 403
- [ ] Delete event
- [ ] List events (no params)
- [ ] List events (filter by category)
- [ ] List events (search)
- [ ] Get single event
- [ ] Register for event (success)
- [ ] Register for event (already registered) → 400
- [ ] Register for event (capacity full) → 201 with waitlist status
- [ ] Cancel registration
