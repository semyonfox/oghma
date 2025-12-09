## What is Redis & Why Use It?

**Redis = Remote Dictionary Server**

- In-memory key-value store (super fast)
- Acts as a cache between your app and database
- Typical response: PostgreSQL = 10-50ms, Redis = <1ms

**Perfect for:**

- Popular society events that don't change often
- Frequently accessed data (trending posts, event details, recommendations)
- Data that's expensive to compute (recommendation scores, student analytics)

---

## Where Redis Fits in Your Architecture

```
┌──────────────────────────────────────────────────┐
│              USER REQUEST                         │
│      "Show me recommended events"                 │
└──────────────────┬───────────────────────────────┘
                   ↓
┌──────────────────────────────────────────────────┐
│           NEXT.JS API ROUTE                       │
│                                                   │
│  1. Check Redis first ──→ Cache hit? Return!   │
│                    ↓                              │
│              Cache miss?                        │
│                    ↓                              │
│  2. Query PostgreSQL (slow)                       │
│                    ↓                              │
│  3. Store result in Redis (for next time)        │
│                    ↓                              │
│  4. Return to user                                │
└──────────────────────────────────────────────────┘

RESULT:
First request:  PostgreSQL (50ms) + Store in Redis
Next 1000 requests: Redis only (<1ms) ← 50x faster!
```

---

## Setup Redis

### Installation

```bash
# Install Redis client
npm install redis

# For TypeScript
npm install --save-dev @types/redis
```

### Local Development

```bash
# Option 1: Docker (easiest)
docker run -d -p 6379:6379 redis

# Option 2: Install locally
# Mac: brew install redis
# Ubuntu: sudo apt install redis
redis-server
```

### Production

- Use **Upstash** (serverless Redis, free tier)
- Or **Redis Cloud** (free 30MB)
- Or **Vercel KV** (if deploying to Vercel)

---

## Redis Connection Setup

```typescript
// lib/redis.ts
import { createClient } from 'redis';

// Create Redis client
const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  // For Upstash or Redis Cloud, use their connection string
});

redis.on('error', (err) => console.error('Redis Client Error', err));
redis.on('connect', () => console.log('Redis Connected'));

// Connect on import
redis.connect();

// Helper functions
export const redisClient = redis;

// Set with expiration (TTL = Time To Live)
export async function setCache(
  key: string, 
  value: any, 
  expirySeconds: number = 3600 // 1 hour default
) {
  await redis.setEx(key, expirySeconds, JSON.stringify(value));
}

// Get from cache
export async function getCache(key: string) {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

// Delete from cache (when data changes)
export async function deleteCache(key: string) {
  await redis.del(key);
}

// Delete multiple keys by pattern
export async function deleteCachePattern(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(keys);
  }
}

export default redis;
```

---

## Basic Redis Concepts

### Key-Value Storage

```typescript
// Redis stores everything as key-value pairs

// String value
await redis.set('user:123:name', 'Seán');
await redis.get('user:123:name'); // Returns: 'Seán'

// JSON value (stringify first)
await redis.set('user:123', JSON.stringify({
  name: 'Seán',
  language: 'ga'
}));
const user = JSON.parse(await redis.get('user:123'));

// With expiration (auto-delete after time)
await redis.setEx('session:abc', 3600, 'data'); // Expires in 1 hour
```

### Key Naming Convention

```typescript
// Use colons to namespace keys (like folder structure)

'user:123'                    // User ID 123
'post:456:en'                 // Post 456 in English
'post:456:ga'                 // Post 456 in Irish
'event:789:popular'           // Popular event 789
'feed:user123:en'             // User 123's English feed
'trending:posts:ga'           // Trending Irish posts
'stats:daily:2025-01-15'      // Daily stats for Jan 15
```

---

## Example 1: Cache Popular Events

### Scenario:

Society event becomes popular (many registrations) → cache it in both English and Irish for fast delivery

```typescript
// app/api/events/[id]/route.ts
import { query } from '@/lib/db';
import { getCache, setCache, deleteCache } from '@/lib/redis';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get('lang') || 'en';
  const eventId = params.id;

  // 1. Try Redis cache first
  const cacheKey = `event:${eventId}:${language}`;
  const cached = await getCache(cacheKey);
  
  if (cached) {
    console.log('Cache HIT - returned in <1ms');
    return NextResponse.json({ 
      event: cached,
      source: 'cache' 
    });
  }

  // 2. Cache miss - query PostgreSQL
  console.log('Cache MISS - querying database...');
  
  const result = await query(`
    SELECT 
      e.id,
      e.title,
      e.description,
      e.location,
      e.start_time,
      e.image_url,
      e.is_popular,
      u.name as organizer_name,
      u.avatar_url as organizer_avatar
    FROM events e
    JOIN users u ON e.organizer_id = u.id
    WHERE e.id = $1
  `, [eventId]);

  if (result.rows.length === 0) {
    return NextResponse.json(
      { error: 'Event not found' },
      { status: 404 }
    );
  }

  const event = result.rows[0];

  // 3. Store in Redis (longer TTL if popular)
  const ttl = event.is_popular ? 3600 : 600; // 1 hour vs 10 minutes
  await setCache(cacheKey, event, ttl);
  
  console.log(`Stored in cache for ${ttl} seconds`);

  return NextResponse.json({ 
    event,
    source: 'database' 
  });
}
```

### Mark Event as Popular & Pre-cache

```typescript
// app/api/events/[id]/popular/route.ts
import { query } from '@/lib/db';
import { setCache } from '@/lib/redis';
import { NextResponse } from 'next/server';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const eventId = params.id;

  // 1. Update database
  const result = await query(`
    UPDATE events
    SET is_popular = true
    WHERE id = $1
    RETURNING *
  `, [eventId]);

  const event = result.rows[0];

  // 2. Pre-cache in BOTH languages (proactive caching)
  // When event becomes popular, cache it immediately so first users also get fast response
  
  await Promise.all([
    // Cache English version
    setCache(
      `event:${eventId}:en`,
      { ...event, language: 'en' },
      7200 // 2 hours for popular events
    ),
    // Cache Irish version
    setCache(
      `event:${eventId}:ga`,
      { ...event, language: 'ga' },
      7200
    ),
    // Also cache in popular events list
    addToPopularList(eventId)
  ]);

  return NextResponse.json({ 
    message: 'Event marked as popular and cached',
    event 
  });
}

// Helper: Maintain a list of popular event IDs
async function addToPopularList(eventId: string) {
  await redis.sAdd('events:popular', eventId); // Set (no duplicates)
  await redis.expire('events:popular', 7200); // Expire list after 2 hours
}
```

---

## Example 2: Cache User Feed

```typescript
// app/api/feed/route.ts
import { query } from '@/lib/db';
import { getCache, setCache } from '@/lib/redis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  const language = searchParams.get('lang') || 'en';

  // Cache key includes user and language
  const cacheKey = `feed:${userId}:${language}`;
  
  // Try cache
  const cached = await getCache(cacheKey);
  if (cached) {
    return NextResponse.json({ posts: cached, source: 'cache' });
  }

  // Query database (expensive - JOINs, sorting, filtering)
  const result = await query(`
    SELECT 
      p.id,
      p.translations->$1->>'title' as title,
      p.translations->$1->>'content' as content,
      p.like_count,
      u.name as author_name
    FROM posts p
    JOIN users u ON p.user_id = u.id
    WHERE p.user_id IN (
      SELECT following_id FROM follows WHERE follower_id = $2
    )
    ORDER BY p.created_at DESC
    LIMIT 20
  `, [language, userId]);

  const posts = result.rows;

  // Cache for 5 minutes (feeds change frequently)
  await setCache(cacheKey, posts, 300);

  return NextResponse.json({ posts, source: 'database' });
}
```

---

## Example 3: Cache Trending Posts

```typescript
// app/api/trending/route.ts
import { query } from '@/lib/db';
import { getCache, setCache } from '@/lib/redis';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get('lang') || 'en';

  const cacheKey = `trending:${language}`;
  
  // Check cache
  const cached = await getCache(cacheKey);
  if (cached) {
    return NextResponse.json({ posts: cached });
  }

  // Complex calculation (engagement score)
  const result = await query(`
    SELECT 
      p.id,
      p.translations->$1->>'title' as title,
      p.like_count,
      p.comment_count,
      (p.like_count * 2 + p.comment_count * 3) as engagement_score
    FROM posts p
    WHERE p.created_at > NOW() - INTERVAL '24 hours'
      AND p.translations ? $1
    ORDER BY engagement_score DESC
    LIMIT 10
  `, [language]);

  const trending = result.rows;

  // Cache trending for 10 minutes (everyone sees same list)
  await setCache(cacheKey, trending, 600);

  return NextResponse.json({ posts: trending });
}
```

---

## Example 4: Cache Invalidation (When Data Changes)

### When user creates/edits post → clear relevant caches

```typescript
// app/api/posts/route.ts
import { query } from '@/lib/db';
import { deleteCache, deleteCachePattern } from '@/lib/redis';

export async function POST(request: Request) {
  const body = await request.json();
  const { userId, translations } = body;

  // Create post in database
  const result = await query(`
    INSERT INTO posts (user_id, translations, status)
    VALUES ($1, $2, 'published')
    RETURNING *
  `, [userId, JSON.stringify(translations)]);

  const post = result.rows[0];

  // IMPORTANT: Clear affected caches
  await Promise.all([
    // Clear user's own feed
    deleteCachePattern(`feed:${userId}:*`), // Clears all languages
    
    // Clear feeds of all followers (they should see new post)
    clearFollowerFeeds(userId),
    
    // Clear trending (new post might affect rankings)
    deleteCachePattern('trending:*')
  ]);

  return NextResponse.json({ post });
}

async function clearFollowerFeeds(userId: string) {
  // Get user's followers
  const result = await query(`
    SELECT follower_id FROM follows WHERE following_id = $1
  `, [userId]);
  
  // Clear each follower's feed cache
  const clearPromises = result.rows.map(row => 
    deleteCachePattern(`feed:${row.follower_id}:*`)
  );
  
  await Promise.all(clearPromises);
}
```

---

## Redis Data Structures You'll Use

### 1. String (Most Common)

```typescript
// Store simple values or JSON
await redis.set('key', 'value');
await redis.setEx('key', 3600, 'value'); // With expiration
await redis.get('key');
```

### 2. Set (Unique Lists)

```typescript
// Popular event IDs (no duplicates)
await redis.sAdd('events:popular', 'event123', 'event456');
await redis.sMembers('events:popular'); // Get all
await redis.sIsMember('events:popular', 'event123'); // Check if exists
```

### 3. Sorted Set (Leaderboards/Rankings)

```typescript
// Trending posts with scores
await redis.zAdd('trending:posts', [
  { score: 150, value: 'post123' },
  { score: 200, value: 'post456' },
]);
// Get top 10
await redis.zRange('trending:posts', 0, 9, { REV: true });
```

### 4. Hash (Object Fields)

```typescript
// User session data
await redis.hSet('user:123', {
  name: 'Seán',
  language: 'ga',
  lastSeen: Date.now()
});
await redis.hGetAll('user:123');
```

---

## Cache Strategy Summary

### What to Cache & For How Long

|Data Type|Cache Duration|Why|
|---|---|---|
|**Popular events**|1-2 hours|Doesn't change often, high traffic|
|**Trending posts**|10 minutes|Updates frequently, same for everyone|
|**User feeds**|5 minutes|Personal, updates when following posts|
|**Single post**|1 hour|Rarely changes, high read rate|
|**User profile**|30 minutes|Changes occasionally|
|**Translation stats**|1 hour|Expensive to calculate|
|**Search results**|5 minutes|Query-specific, high traffic|

### Cache Invalidation Rules

```typescript
// When to clear cache:

// User creates post → Clear:
- Their own feed
- Followers' feeds
- Trending lists

// User likes post → Clear:
- Trending lists (scores change)
- That post's cache (like_count changed)

// Event marked popular → Pre-cache:
- Event details in all languages
- Add to popular events list

// User updates profile → Clear:
- user:ID:* (all cached user data)
- Any posts by that user

// Translation added → Clear:
- That post in new language
- "Needs translation" lists
```

---

## Complete Redis Integration Example

### Environment Variables

```bash
# .env.local
REDIS_URL=redis://localhost:6379
# OR for production:
# REDIS_URL=redis://username:password@redis-host:6379
```

### Full Implementation: Popular Event with Caching

```typescript
// lib/cache-keys.ts
// Centralized cache key management
export const CacheKeys = {
  event: (id: string, lang: string) => `event:${id}:${lang}`,
  eventPopular: (id: string) => `event:${id}:popular`,
  popularEvents: () => 'events:popular:list',
  userFeed: (userId: string, lang: string) => `feed:${userId}:${lang}`,
  trending: (lang: string) => `trending:${lang}`,
  postLikes: (postId: string) => `post:${postId}:likes`,
};

// lib/cache-ttl.ts
// Centralized TTL (time-to-live) settings
export const CacheTTL = {
  popularEvent: 7200,    // 2 hours
  regularEvent: 600,     // 10 minutes
  userFeed: 300,         // 5 minutes
  trending: 600,         // 10 minutes
  singlePost: 3600,      // 1 hour
  userProfile: 1800,     // 30 minutes
};
```

### API Route with Full Caching

```typescript
// app/api/events/popular/route.ts
import { query } from '@/lib/db';
import { getCache, setCache } from '@/lib/redis';
import { CacheKeys, CacheTTL } from '@/lib/cache-keys';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const language = searchParams.get('lang') || 'en';

  // 1. Check cache
  const cacheKey = CacheKeys.popularEvents();
  const cached = await getCache(cacheKey);
  
  if (cached) {
    return NextResponse.json({ 
      events: cached,
      cached: true,
      language 
    });
  }

  // 2. Query database
  const result = await query(`
    SELECT 
      e.id,
      e.title,
      e.description,
      e.location,
      e.start_time,
      e.image_url,
      e.is_popular,
      u.name as organizer_name
    FROM events e
    JOIN users u ON e.organizer_id = u.id
    WHERE e.is_popular = true
      AND e.start_time > NOW()
    ORDER BY e.start_time ASC
    LIMIT 10
  `);

  const events = result.rows;

  // 3. Cache result
  await setCache(
    cacheKey, 
    events, 
    CacheTTL.popularEvent
  );

  // 4. Also pre-cache individual events
  await Promise.all(
    events.map(event => 
      setCache(
        CacheKeys.event(event.id, language),
        event,
        CacheTTL.popularEvent
      )
    )
  );

  return NextResponse.json({ 
    events,
    cached: false,
    language 
  });
}
```

---

## Monitoring Redis (Important!)

### Check What's in Cache

```typescript
// app/api/admin/cache-stats/route.ts
import redis from '@/lib/redis';
import { NextResponse } from 'next/server';

export async function GET() {
  // Get cache statistics
  const info = await redis.info('stats');
  const dbSize = await redis.dbSize();
  const memory = await redis.info('memory');

  // Sample some keys
  const sampleKeys = await redis.keys('*'); // Don't do this in production with lots of keys!

  return NextResponse.json({
    totalKeys: dbSize,
    sampleKeys: sampleKeys.slice(0, 20), // First 20 keys
    stats: info,
    memory: memory
  });
}
```

### Clear All Cache (For Testing)

```typescript
// app/api/admin/clear-cache/route.ts
export async function POST() {
  await redis.flushAll();
  return NextResponse.json({ message: 'Cache cleared' });
}
```

---

## Redis on CV

### How to Present It:

**Project Description:**

> "Implemented Redis caching layer for performance optimization, reducing average response time from 50ms to <1ms for frequently accessed content like popular events and user feeds"

**Technical Bullet:**

- Designed cache invalidation strategy for social media features, maintaining data consistency while improving read performance by 50x
- Implemented multi-language content caching with automatic TTL management based on content popularity
- Used Redis sorted sets for real-time trending calculations and Set operations for popular content tracking

**Interview Talking Points:**

1. "Why Redis instead of just database?" → Speed, reduce DB load, better user experience
2. "How do you handle cache invalidation?" → Clear affected caches when data changes
3. "What happens if Redis goes down?" → App still works, just slower (graceful degradation)

---

## Quick Reference: Common Operations

```typescript
// SET operations (unique lists)
await redis.sAdd('events:popular', eventId);
await redis.sMembers('events:popular'); // Get all
await redis.sCard('events:popular'); // Count

// EXPIRATION
await redis.expire('key', 3600); // Set TTL
await redis.ttl('key'); // Check remaining time

// MULTIPLE keys
await redis.mGet(['key1', 'key2', 'key3']); // Get multiple
await redis.del(['key1', 'key2']); // Delete multiple

// PATTERNS
await redis.keys('feed:*'); // Find keys (slow, use sparingly!)
await redis.scan(0, { MATCH: 'feed:*', COUNT: 100 }); // Better for production

// ATOMIC operations
await redis.incr('post:123:views'); // Increment counter
await redis.incrBy('post:123:likes', 5); // Increment by N
```

---

## Caching Student Data from University API

### Why Cache Student Data

- University API has rate limits
- Student course data changes infrequently (once per semester)
- Reduces OAuth token usage
- Faster recommendations (student data used in scoring)

### Implementation

```typescript
// lib/university/student-cache.ts
import { redis } from '@/lib/redis';

async function getStudentData(userId: string, accessToken: string) {
  const cacheKey = `student:data:${userId}`;

  // Try cache first (24 hour TTL)
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log('Student data from cache');
    return JSON.parse(cached);
  }

  // Fetch from university API
  console.log('Fetching from university API...');
  const response = await fetch(
    `${process.env.UNI_STUDENT_API_URL}/students/me`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-API-Key': process.env.UNI_STUDENT_API_KEY!,
      },
    }
  );

  const data = await response.json();

  const studentData = {
    studentId: data.studentId,
    courses: data.enrolledCourses,
    department: data.department,
    year: data.academicYear,
    societies: data.societyMemberships || [],
  };

  // Cache for 24 hours
  await redis.setEx(cacheKey, 86400, JSON.stringify(studentData));

  return studentData;
}
```

### Cache Invalidation for Student Data

```typescript
// Manual refresh (user clicks "Sync My Courses")
async function refreshStudentData(userId: string) {
  await redis.del(`student:data:${userId}`);
  // Next request will fetch fresh data
}

// Daily background job (clear all student data caches)
async function dailyStudentDataRefresh() {
  const keys = await redis.keys('student:data:*');
  if (keys.length > 0) {
    await redis.del(keys);
  }
  console.log(`Cleared ${keys.length} student data caches`);
}

// Semester change (clear all at start of semester)
async function semesterChangeRefresh() {
  await redis.flushDb();  // Clear entire cache
  console.log('Semester refresh: All caches cleared');
}
```

### Usage in Recommendation Engine

```typescript
// Calculate event recommendations using cached student data
async function getRecommendations(userId: string) {
  // Get student data (from cache or API)
  const studentData = await getStudentData(userId, userToken);

  // Use student's society memberships in scoring
  const events = await prisma.event.findMany({
    include: { society: true },
  });

  const scored = events.map(event => {
    let score = 0;

    // Boost if user is in this society
    if (studentData.societies.includes(event.societyId)) {
      score += 50;
    }

    // Boost if event matches user's department
    if (event.society.department === studentData.department) {
      score += 20;
    }

    return { eventId: event.id, score };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, 20);
}
```

---

## Summary Diagram

```
┌─────────────────────────────────────────────────────┐
│                 REQUEST FLOW                         │
└─────────────────────────────────────────────────────┘

User requests recommended events
         ↓
   Check Redis
   `recommendations:user123`
         ↓
    ┌────┴────┐
    │         │
  Found?    Not found?
    │         │
    │         └→ Fetch student data (cached)
    │               ↓
    │            Calculate recommendations
    │               ↓
    │            Store in Redis (TTL: 1 hour)
    │               ↓
    └───────────────┘
         ↓
   Return to user (<1ms from cache, 50ms from calculation)

CACHE INVALIDATION:
- User creates/likes post → Clear their recommendations
- New event created → Clear all recommendations (batch job will refresh)
- Daily: Clear student data caches
- Semester start: Clear entire cache
```

**Key Takeaway:** Redis makes your app feel instant for repeated requests. First user gets normal speed, next 1000 users get lightning speed!

---

**Platform-Specific Notes:**
- **Society events:** Cache for 1-2 hours (updates infrequently)
- **Trending posts:** Cache for 10 minutes (changes often)
- **Student data:** Cache for 24 hours (semester data is stable)
- **Recommendations:** Cache for 1 hour (balanced between freshness and performance)