# Development Guide

**Coding Standards, Git Workflow, and Team Collaboration**

This document outlines the development workflow, coding standards, and collaboration practices for the project.

---

## Table of Contents

1. [Development Environment Setup](#1-development-environment-setup)
2. [Git Workflow](#2-git-workflow)
3. [Code Review Process](#3-code-review-process)
4. [Coding Standards](#4-coding-standards)
5. [Testing Guidelines](#5-testing-guidelines)
6. [Documentation Standards](#6-documentation-standards)

---

## 1. Development Environment Setup

### Prerequisites

- Node.js 20+ and npm
- Docker and Docker Compose
- Git
- Code editor (VS Code recommended)

### Initial Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd ct216_project

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your settings

# 4. Start Docker services (PostgreSQL + Redis)
docker-compose up -d

# 5. Run database migrations
npm run migrate

# 6. Seed database (optional)
npm run seed

# 7. Start development server
npm run dev
```

### VS Code Extensions (Recommended)

- ESLint
- Prettier
- TypeScript
- Prisma (if using Prisma)
- Docker
- GitLens

---

## 2. Git Workflow

### Branching Strategy

**Main Branches:**
- `main` - Production-ready code (protected)
- `develop` - Integration branch for features

**Feature Branches:**
- `feature/event-registration` - New features
- `fix/login-bug` - Bug fixes
- `refactor/database-queries` - Code refactoring
- `docs/api-documentation` - Documentation updates

### Workflow Steps

**1. Create Feature Branch:**
```bash
git checkout main
git pull origin main
git checkout -b feature/event-registration
```

**2. Work on Feature:**
```bash
# Make changes
git add .
git commit -m "feat: add event registration endpoint"

# Push to remote
git push -u origin feature/event-registration
```

**3. Open Pull Request:**
- Go to GitHub
- Click "New Pull Request"
- Base: `main`, Compare: `feature/event-registration`
- Fill in PR template:
  ```markdown
  ## Description
  Adds event registration functionality

  ## Changes
  - Add POST /api/events/:id/register endpoint
  - Add capacity validation
  - Add transaction for race condition prevention

  ## Testing
  - Tested with 50 concurrent requests
  - Verified capacity limits work correctly

  ## Screenshots
  (if applicable)
  ```

**4. Code Review:**
- Semyon (PM) reviews code
- Address feedback
- Push updates to same branch (PR updates automatically)

**5. Merge:**
- Semyon merges to `main`
- Delete feature branch

### Commit Message Convention

**Format:**
```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code formatting (no logic change)
- `refactor`: Code refactoring
- `test`: Add/update tests
- `chore`: Build process, dependencies

**Examples:**
```bash
git commit -m "feat(events): add event registration endpoint"
git commit -m "fix(auth): resolve JWT token expiration issue"
git commit -m "docs: update API documentation for events"
git commit -m "refactor(database): optimize recommendation queries"
```

---

## 3. Code Review Process

### Pull Request Checklist

**Before Opening PR:**
- [ ] Code compiles without errors
- [ ] All tests pass (if applicable)
- [ ] Lint checks pass (`npm run lint`)
- [ ] Code is properly formatted (`npm run format`)
- [ ] No console.log statements (use proper logging)
- [ ] Environment variables documented in `.env.example`
- [ ] README updated (if needed)

**PR Description Must Include:**
1. What changed
2. Why it changed
3. How to test
4. Screenshots (if UI change)

### Review Criteria

**Semyon (PM) Checks:**

**1. Functionality:**
- Does code work as expected?
- Are edge cases handled?
- Is error handling robust?

**2. Code Quality:**
- Is code readable and maintainable?
- Are variables/functions well-named?
- Is there unnecessary complexity?
- Are there code smells (duplication, long functions)?

**3. Performance:**
- Are queries optimized?
- Is caching used appropriately?
- Are there N+1 query problems?

**4. Security:**
- Is input validated?
- Are SQL injections prevented?
- Is authentication/authorization checked?
- Are secrets stored securely?

**5. Testing:**
- Are critical paths tested?
- Are tests meaningful (not just for coverage)?

**6. Documentation:**
- Are complex functions documented?
- Are API changes documented?
- Is README updated?

### Addressing Feedback

**Process:**
1. Read feedback carefully
2. Ask questions if unclear
3. Make requested changes
4. Push updates to same branch
5. Reply to comments ("Done" or explanation)
6. Request re-review

**Example:**
```markdown
Reviewer: "This function is too long. Can you split it into smaller functions?"

You: "Good point! I've refactored it into 3 smaller functions:
- validateEventData()
- createEventRecord()
- sendNotifications()

Please review again."
```

---

## 4. Coding Standards

### TypeScript Guidelines

**1. Use Explicit Types (Not `any`):**
```typescript
// ❌ Bad
function getEvent(id: any): any {
  return fetch(`/api/events/${id}`);
}

// ✅ Good
type Event = {
  id: string;
  title: string;
  eventDate: Date;
};

async function getEvent(id: string): Promise<Event> {
  const response = await fetch(`/api/events/${id}`);
  return response.json();
}
```

**2. Use Interfaces for Objects:**
```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
  name: string;
}

function updateUser(user: User): Promise<void> {
  // ...
}
```

**3. Use Enums for Constants:**
```typescript
// ✅ Good
enum EventStatus {
  Published = 'published',
  Draft = 'draft',
  Cancelled = 'cancelled',
}

const event: Event = {
  status: EventStatus.Published,
};
```

### Naming Conventions

**Variables and Functions:**
```typescript
// camelCase for variables and functions
const userId = '123';
function getUserById(id: string) {}
```

**Types and Interfaces:**
```typescript
// PascalCase for types and interfaces
type Event = {};
interface User {}
```

**Constants:**
```typescript
// UPPER_SNAKE_CASE for constants
const MAX_CAPACITY = 100;
const API_BASE_URL = 'https://api.example.com';
```

**Files:**
```
// kebab-case for files
event-card.tsx
user-profile.tsx
api-client.ts
```

### Code Organization

**File Structure:**
```
/src/
  ├── app/
  │   ├── api/            # Backend API routes
  │   └── [locale]/       # Frontend pages
  ├── components/
  │   ├── ui/             # Reusable UI components
  │   └── features/       # Feature-specific components
  ├── lib/
  │   ├── db.ts           # Database connection
  │   ├── auth.ts         # Authentication utilities
  │   └── redis.ts        # Cache utilities
  └── types/
      └── index.ts        # Shared TypeScript types
```

**Component Structure:**
```typescript
// event-card.tsx

// 1. Imports
import { Event } from '@/types';
import Link from 'next/link';

// 2. Types (if component-specific)
type EventCardProps = {
  event: Event;
  onRegister?: (eventId: string) => void;
};

// 3. Component
export function EventCard({ event, onRegister }: EventCardProps) {
  // Logic here
  return (
    // JSX here
  );
}
```

### Avoid Common Mistakes

**1. Don't Mutate State Directly:**
```typescript
// ❌ Bad
const [events, setEvents] = useState<Event[]>([]);
events.push(newEvent); // Mutating state directly!

// ✅ Good
setEvents([...events, newEvent]);
```

**2. Don't Forget to Handle Errors:**
```typescript
// ❌ Bad
async function fetchEvents() {
  const response = await fetch('/api/events');
  return response.json();
}

// ✅ Good
async function fetchEvents(): Promise<Event[]> {
  try {
    const response = await fetch('/api/events');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  } catch (error) {
    console.error('Failed to fetch events:', error);
    throw error;
  }
}
```

**3. Don't Use `console.log` in Production:**
```typescript
// ❌ Bad
console.log('User registered:', user);

// ✅ Good (use proper logging)
import { logger } from '@/lib/logger';
logger.info('User registered', { userId: user.id });
```

---

## 5. Testing Guidelines

### Unit Testing (Optional for MVP)

**Tools:**
- Jest (test runner)
- React Testing Library (component testing)

**Example:**
```typescript
// __tests__/lib/auth.test.ts
import { validateJWT } from '@/lib/auth';

describe('validateJWT', () => {
  it('should validate correct JWT token', () => {
    const token = 'valid-jwt-token';
    const result = validateJWT(token);
    expect(result.valid).toBe(true);
  });

  it('should reject expired JWT token', () => {
    const token = 'expired-jwt-token';
    const result = validateJWT(token);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Token expired');
  });
});
```

### Manual Testing Checklist

**For Every Feature:**
1. **Happy Path:** Test expected workflow
2. **Edge Cases:** Test with invalid inputs, empty data, max capacity
3. **Error Handling:** Test with network errors, database errors
4. **Performance:** Test with large datasets (100+ records)
5. **Mobile:** Test on mobile devices (responsive design)

**Example (Event Registration):**
```markdown
- [ ] Register for event (happy path)
- [ ] Register for full event (waitlist)
- [ ] Register twice (should prevent duplicate)
- [ ] Register with invalid event ID (404 error)
- [ ] Register without authentication (redirect to login)
- [ ] Unregister from event
- [ ] Concurrent registrations (capacity check)
```

---

## 6. Documentation Standards

### Code Documentation

**JSDoc Comments for Public Functions:**
```typescript
/**
 * Fetches a user by their ID.
 *
 * @param id - The unique identifier of the user
 * @returns A promise that resolves to the user object
 * @throws {Error} If the user is not found or database connection fails
 *
 * @example
 * const user = await getUserById('123');
 * console.log(user.email);
 */
export async function getUserById(id: string): Promise<User> {
  // Implementation
}
```

**Inline Comments for Complex Logic:**
```typescript
// Calculate recommendation score based on:
// 1. Society membership (50 points)
// 2. Past attendance (30 points)
// 3. Content similarity (15 points)
// 4. Randomness (10% chance, prevent filter bubble)
const score = membershipScore + attendanceScore + similarityScore + randomBonus;
```

### API Documentation

**Document All Endpoints:**
```typescript
/**
 * POST /api/events/:id/register
 *
 * Registers the current user for an event.
 *
 * Request Body: None
 *
 * Response (200):
 * {
 *   "message": "Successfully registered",
 *   "registration": { "eventId": "123", "userId": "456", "status": "registered" },
 *   "spotsRemaining": 54
 * }
 *
 * Response (400):
 * {
 *   "error": "Already registered for this event"
 * }
 *
 * Response (401):
 * {
 *   "error": "Authentication required"
 * }
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  // Implementation
}
```

### README Updates

**Update README When:**
- Adding new environment variables
- Adding new npm scripts
- Changing deployment process
- Adding new dependencies

---

## Team Collaboration

### Daily Standups (15 Minutes)

**Format:**
1. What I completed yesterday
2. What I'm working on today
3. Any blockers or help needed

**Example:**
> "Yesterday: Completed event registration endpoint.
> Today: Working on registration UI component.
> Blockers: Need clarification on waitlist behavior when event capacity increases."

### Weekly Reviews (1 Hour, Fridays)

**Agenda:**
1. Demo completed features (5 min per person)
2. Review progress against timeline
3. Discuss upcoming week's priorities
4. Address any issues or concerns

### Communication Channels

- **Discord/Slack:** Quick questions, daily updates
- **GitHub Issues:** Bug reports, feature requests
- **GitHub PRs:** Code reviews, technical discussions
- **Google Meet:** Video calls for complex discussions

---

## Best Practices Summary

✅ **DO:**
- Write descriptive commit messages
- Ask questions early (don't struggle alone)
- Test your code before pushing
- Keep PRs small and focused
- Document complex logic
- Review others' code (learn from each other)

❌ **DON'T:**
- Push directly to `main` (always use PRs)
- Commit secrets (.env files, API keys)
- Leave commented-out code
- Use `console.log` for debugging (use proper logging)
- Ignore linter warnings
- Wait until last minute to ask for help

---

**Related Documents:**
- [PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md) - Project scope and timeline
- [QUICKSTART.md](./QUICKSTART.md) - Quick deployment guide
- [INFRASTRUCTURE_AND_DEVOPS.md](./INFRASTRUCTURE_AND_DEVOPS.md) - Deployment setup

---

**Last Updated:** November 24, 2025
**Author:** Development Team
**Maintained By:** Semyon (Project Manager)
