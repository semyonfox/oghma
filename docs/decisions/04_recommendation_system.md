# Recommendation System Design

**Hybrid recommender system for personalized event and content discovery**

---

## Table of Contents

1. [Decision Context](#1-decision-context)
2. [System Integration Architecture](#2-system-integration-architecture)
3. [Technology Evaluation](#3-technology-evaluation)
4. [Alternatives Explored and Discarded](#4-alternatives-explored-and-discarded)
5. [Final Architecture Decision](#5-final-architecture-decision)
6. [Recommendation Algorithm Design](#6-recommendation-algorithm-design)
7. [Data Model](#7-data-model)
8. [Implementation Plan](#8-implementation-plan)
9. [Deployment Strategy](#9-deployment-strategy)

---

## 1. Decision Context

### The Problem

University students face information overload:
- 50+ societies, each posting multiple events per week
- Limited time to browse all available events
- Missing events they'd genuinely enjoy
- Discovering societies aligned with their interests is difficult

### Goals

Build a recommendation system that:
- **Personalizes** discovery based on user interests and behavior
- **Balances** multiple signals (personal taste, content similarity, social influence)
- **Scales** to handle hundreds of concurrent users
- **Performs** efficiently (recommendations served in <100ms)
- **Integrates** seamlessly with existing Next.js architecture

### Success Criteria

- [x] Users see relevant events they wouldn't have found otherwise
- [x] Click-through rate >15% on recommended events
- [x] Recommendation refresh happens every 30 minutes
- [x] System handles 500+ active users without performance degradation
- [x] Societies gain analytics on recommendation effectiveness

---

## 2. System Integration Architecture

### Current Infrastructure

**Stack Overview:**
```
┌─────────────────────────────────────────────────────┐
│  Frontend (Vercel)                                   │
│  ├── Next.js 16 (App Router)                        │
│  └── React 19 UI                                    │
└─────────────────────────────────────────────────────┘
                    ↓ HTTPS
┌─────────────────────────────────────────────────────┐
│  Cloudflare Tunnel (ct216.semyon.ie)                │
│  ├── Traffic filtering                              │
│  ├── DDoS protection                                │
│  └── Secure routing                                 │
└─────────────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────────────┐
│  Personal Server (Docker/Portainer)                  │
│  ├── Next.js Backend (API routes)                   │
│  ├── PostgreSQL (user/event data)                   │
│  ├── Redis (caching)                                │
│  └── Recommendation Service (Python) ← NEW          │
└─────────────────────────────────────────────────────┘
```

### Integration Points

**Frontend → Backend:**
- Vercel-hosted Next.js frontend makes API calls to backend
- Backend accessible via Cloudflare Tunnel (secure, no direct public exposure)
- Environment variables configure tunnel endpoints

**Backend → Recommendation Service:**
- Next.js API routes call Python recommendation service
- Communication via internal Docker network (no external exposure)
- Batch job runs every 30 minutes to refresh recommendations
- Results cached in PostgreSQL + Redis for fast serving

---

## 3. Technology Evaluation

### Backend Language Options

We evaluated three languages for the recommendation engine:

#### Option A: JavaScript/TypeScript (Next.js)

**Pros:**
- [x] Same language as rest of stack
- [x] Easy integration with existing codebase
- [x] Team already familiar

**Cons:**
- [ ] Limited ML/recommendation libraries
- [ ] Performance concerns for matrix operations
- [ ] No mature collaborative filtering libraries

**Verdict:** [ ] Rejected - insufficient ML ecosystem

---

#### Option B: Rust

**Initial Appeal:**
- [x] Blazing fast performance
- [x] Memory safety
- [x] Learning opportunity for systems programming
- [x] Excellent PostgreSQL drivers ([tokio-postgres](https://docs.rs/postgres), [diesel](https://diesel.rs))
- [x] Recommendation libraries exist ([sbr-rs](https://github.com/maciejkula/sbr-rs))

**Challenges Discovered:**
- [ ] Steep learning curve (lifetimes, borrowing)
- [ ] Small ML ecosystem compared to Python
- [ ] Longer development time (8-week deadline tight)
- [ ] sbr-rs library less mature than Python alternatives
- [ ] Team has no prior Rust experience

**Investigation:**
- Reviewed [sbr-rs documentation](https://github.com/maciejkula/sbr-rs) and examples
- Tested PostgreSQL integration with `tokio-postgres`
- Benchmarked against Python implementations
- Read case study: ["Serving ML at the speed of Rust"](https://shvbsle.in/serving-ml-at-the-speed-of-rust/)

**Verdict:** [ ] Deferred - Great for future optimization, but too risky for initial implementation given timeline and team experience

---

#### Option C: C++

**Appeal:**
- [x] High performance
- [x] Mature ML libraries (TensorFlow C++ API, Vowpal Wabbit)
- [x] Some team experience from coursework

**Challenges:**
- [ ] Manual memory management (error-prone)
- [ ] Longer development time
- [ ] Fewer high-level recommendation libraries than Python
- [ ] PostgreSQL integration more complex

**Verdict:** [ ] Rejected - Performance not worth the development overhead

---

#### Option D: Python (CHOSEN)

**Pros:**
- [x] **Mature ML ecosystem:** Surprise, LightFM, Implicit, scikit-learn
- [x] **Fast libraries:** NumPy, SciPy use optimized C/Fortran under the hood
- [x] **Rapid development:** Prototype to production in days, not weeks
- [x] **Team familiarity:** All team members know Python
- [x] **PostgreSQL integration:** Excellent support (psycopg2, SQLAlchemy)
- [x] **Proven at scale:** Used by Netflix, Spotify, YouTube for recommendations

**Performance Reality:**
> "Python's speed with mainstream libraries [like NumPy] would be sufficient for expected usage. No need for custom native extensions unless scaling massively." - From evaluation

**Libraries Evaluated:**

| Library | Purpose | Performance | Ease of Use |
|---------|---------|-------------|-------------|
| **Surprise** | Collaborative filtering | Fast (NumPy/Cython) | ⭐⭐⭐⭐⭐ |
| **LightFM** | Hybrid (CF + content) | Very fast (C++) | ⭐⭐⭐⭐ |
| **Implicit** | Matrix factorization | Fast (Cython) | ⭐⭐⭐⭐ |
| **scikit-learn** | Content-based, clustering | Fast (C/Cython) | ⭐⭐⭐⭐⭐ |
| **TensorFlow/PyTorch** | Deep learning (overkill) | Very fast (GPU) | ⭐⭐ |

**Verdict:** [x] **CHOSEN** - Optimal balance of speed, reliability, and development velocity

---

## 4. Alternatives Explored and Discarded

### Discarded: Real-Time Social Network Graph

**Initial Idea:**
- Implement friending system
- Build peer graph for collaborative filtering
- Real-time updates when friends interact with events

**Why Discarded:**
- [ ] Too complex for MVP (8-week timeline)
- [ ] University societies already provide implicit social connections
- [ ] Co-attendance provides better signal than explicit friending
- [ ] Privacy concerns (students may not want visible friend connections)

**Alternative Adopted:**
- Use **co-attendance patterns** for collaborative filtering
- Track which students attend same events → infer similarity
- No explicit friending required
- Privacy-preserving (no exposed social graph)

---

### Discarded: Microservice Architecture

**Initial Idea:**
- Separate recommendation service as standalone microservice
- Independent deployment and scaling
- Own database and API

**Why Discarded:**
- [ ] Adds deployment complexity (Kubernetes, service mesh)
- [ ] Network latency between services
- [ ] Overkill for team of 4 with single server
- [ ] Harder to debug and monitor

**Alternative Adopted:**
- **Monolithic Python service** running in Docker container alongside Next.js
- Communicates via internal Docker network (fast, simple)
- Shared PostgreSQL database (atomic transactions)
- Can extract to microservice later if scaling requires it

---

### Discarded: Rust/C++ Backend (For Now)

**Decision:**
> "Deferred moving backend logic to Rust/C++ until performance requirements or scaling demand it, after confirming Python's speed with mainstream libraries would be sufficient for expected usage."

**When to Revisit:**
- If recommendation generation takes >30 seconds for batch job
- If real-time recommendations needed (<50ms latency)
- If scaling beyond 10,000 active users
- If team gains Rust expertise and wants to refactor

**Path to Migration:**
- Keep Python interface identical
- Rewrite hot paths in Rust (matrix operations, similarity calculations)
- Call Rust from Python via [PyO3](https://pyo3.rs)
- Benchmark and compare before full migration

---

## 5. Final Architecture Decision

### Hybrid Recommendation System

**Three-Component Approach:**

```
┌─────────────────────────────────────────────────────┐
│  Hybrid Recommender                                  │
│                                                      │
│  ┌────────────────────┐  ┌────────────────────┐    │
│  │  Collaborative     │  │  Content-Based     │    │
│  │  Filtering         │  │  Filtering         │    │
│  │                    │  │                    │    │
│  │  • Co-attendance   │  │  • Event topics    │    │
│  │  • Implicit ratings│  │  • Society tags    │    │
│  │  • Matrix factor.  │  │  • TF-IDF          │    │
│  └────────────────────┘  └────────────────────┘    │
│            ↓                        ↓               │
│        (Weight: 0.6)           (Weight: 0.3)        │
│            ↓                        ↓               │
│  ┌─────────────────────────────────────────────┐   │
│  │        Weighted Score Combiner              │   │
│  └─────────────────────────────────────────────┘   │
│                      ↓                              │
│  ┌─────────────────────────────────────────────┐   │
│  │  Social Boost (+0.1 per co-attendee)        │   │
│  │  • Same faculty → boost                     │   │
│  │  │  • Same society membership → boost          │   │
│  │  • Past event co-attendance → boost         │   │
│  └─────────────────────────────────────────────┘   │
│                      ↓                              │
│             Final Ranked Recommendations            │
└─────────────────────────────────────────────────────┘
```

**Why Hybrid?**

University life is multifaceted:
1. **Personal Taste** - What you've historically liked (collaborative filtering)
2. **Event Content** - Topics that match your interests (content-based)
3. **Social Influence** - Events your peers attend (social boost)

Single-method systems miss critical signals. Hybrid captures all three.

---

## 6. Recommendation Algorithm Design

### User Feedback Signals

**Explicit Feedback:**
- 👍 **Like** (+3 points) - User explicitly likes event
- 👎 **Dislike** (-5 points) - User explicitly dislikes event
- 🙈 **Show Less** (-1 point) - Soft signal of disinterest
- 🔕 **Ignore** (0 points) - Shown but no action

**Implicit Feedback:**
- [x] **RSVP/Register** (+5 points) - Strongest positive signal
- 🎉 **Attended** (+8 points) - Ultimate validation
- 👀 **Clicked/Viewed** (+1 point) - Interest signal
-  **Time on page** (+0-2 points) - Engagement proxy

### Interaction Weighting

| Action | Weight | Rationale |
|--------|--------|-----------|
| Attended | +8 | Strongest signal - user actually went |
| RSVP/Register | +5 | Strong commitment |
| Like | +3 | Explicit positive feedback |
| Clicked | +1 | Mild interest |
| No interaction | 0 | Neutral (not seen or ignored) |
| Show Less | -1 | Weak disinterest |
| Dislike | -5 | Strong negative signal |

### Collaborative Filtering (60% weight)

**Algorithm:** Matrix Factorization (Alternating Least Squares)

**Process:**
1. Build user-event interaction matrix (sparse)
2. Factor into user and item latent features
3. Predict missing interactions via dot product
4. Rank events by predicted score

**Implementation:** Use `implicit` library (fast Cython implementation)

```python
from implicit.als import AlternatingLeastSquares

model = AlternatingLeastSquares(factors=50, iterations=15)
model.fit(user_item_matrix)
recommendations = model.recommend(user_id, user_item_matrix[user_id])
```

**Handles Cold Start:**
- New users: Recommend popular events from their faculty/societies
- New events: Content-based filtering takes over

---

### Content-Based Filtering (30% weight)

**Algorithm:** TF-IDF + Cosine Similarity

**Process:**
1. Extract features from events:
   - Event title/description (TF-IDF)
   - Society tags
   - Event category (workshop, social, academic)
   - Faculty/department
2. Build user profile from events they liked
3. Calculate cosine similarity between user profile and all events
4. Rank by similarity score

**Implementation:** Use `scikit-learn`

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

vectorizer = TfidfVectorizer(max_features=500)
event_features = vectorizer.fit_transform(event_descriptions)
user_profile = event_features[liked_events].mean(axis=0)
scores = cosine_similarity(user_profile, event_features)
```

**Benefits:**
- Works for new events (no interaction data needed)
- Explains recommendations ("Because you liked Python workshops")

---

### Social Boost (10% weight applied as bonus)

**Signals:**
- **Same faculty** → +0.5 boost (e.g., Engineering students to CS society events)
- **Same society membership** → +1.0 boost (e.g., Drama Society members see Drama events)
- **Co-attendance history** → +0.1 per shared event attendee (implicit social network)

**Implementation:**
```python
def calculate_social_boost(user_id, event_id):
    boost = 0.0

    # Faculty match
    if user.faculty == event.society.primary_faculty:
        boost += 0.5

    # Society membership
    if user.is_member_of(event.society):
        boost += 1.0

    # Co-attendance
    attendees = get_event_attendees(event_id)
    user_history = get_user_attended_events(user_id)

    for attendee in attendees:
        shared_events = count_shared_events(user_id, attendee, user_history)
        boost += min(shared_events * 0.1, 1.0)  # Cap at 1.0

    return boost
```

**Avoids Friend Graph:**
- No explicit friending needed
- Privacy-preserving
- Uses co-attendance as implicit social connection

---

### Final Score Calculation

```python
def calculate_recommendation_score(user_id, event_id):
    collab_score = collaborative_filtering(user_id, event_id)
    content_score = content_based_filtering(user_id, event_id)
    social_boost = calculate_social_boost(user_id, event_id)

    # Weighted combination
    final_score = (
        0.6 * collab_score +
        0.3 * content_score +
        0.1 * social_boost
    )

    # Add randomness factor (10% chance)
    if random.random() < 0.1:
        final_score += random.uniform(0, 2.0)

    return final_score
```

**Randomness Factor:**
- 10% chance to boost lower-scored items
- Prevents filter bubble
- Helps users discover unexpected interests
- Enables A/B testing of recommendations

---

## 7. Data Model

### Database Schema Extensions

```sql
-- Interaction tracking
CREATE TABLE interactions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES login(user_id),
    event_id INT REFERENCES events(event_id),
    interaction_type VARCHAR(20), -- 'like', 'dislike', 'rsvp', 'attend', 'view', 'show_less'
    weight FLOAT,  -- Computed from interaction_type
    created_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_user_interactions (user_id, created_at),
    INDEX idx_event_interactions (event_id, created_at)
);

-- Pre-computed recommendations (cached)
CREATE TABLE recommendations (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES login(user_id),
    event_id INT REFERENCES events(event_id),
    score FLOAT,
    generated_at TIMESTAMP DEFAULT NOW(),
    INDEX idx_user_recommendations (user_id, score DESC),
    UNIQUE(user_id, event_id)
);

-- User interests (for content-based filtering)
CREATE TABLE user_interests (
    user_id INT REFERENCES login(user_id),
    interest VARCHAR(100),
    weight FLOAT DEFAULT 1.0,
    PRIMARY KEY (user_id, interest)
);

-- Event features (for content-based filtering)
CREATE TABLE event_features (
    event_id INT REFERENCES events(event_id),
    feature VARCHAR(100),
    weight FLOAT DEFAULT 1.0,
    PRIMARY KEY (event_id, feature)
);

-- Society analytics (for committee dashboards)
CREATE TABLE recommendation_impressions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES login(user_id),
    event_id INT REFERENCES events(event_id),
    shown_at TIMESTAMP DEFAULT NOW(),
    clicked BOOLEAN DEFAULT FALSE,
    INDEX idx_event_impressions (event_id, shown_at)
);
```

### Redis Cache Structure

```python
# Recommendation cache (1 hour TTL)
redis.setex(
    f"recommendations:{user_id}",
    3600,
    json.dumps([
        {"event_id": 123, "score": 8.5},
        {"event_id": 456, "score": 7.2},
        # ... top 20 recommendations
    ])
)

# Event popularity cache (5 minutes TTL)
redis.setex(
    f"popular_events:{faculty}",
    300,
    json.dumps([event_id_1, event_id_2, ...])
)

# User profile cache (24 hours TTL)
redis.setex(
    f"user_profile:{user_id}",
    86400,
    json.dumps({
        "interests": ["tech", "workshops", "python"],
        "faculty": "Engineering",
        "societies": [1, 5, 12]
    })
)
```

---

## 8. Implementation Plan

### Phase 1: Data Collection (Week 1-2)
- [x] Add interaction tracking to existing event pages
- [x] Log clicks, RSVPs, likes, dislikes
- [x] Build interaction history dataset

### Phase 2: Python Service Setup (Week 3)
- 📋 Create Docker container for Python service
- 📋 Set up PostgreSQL connection (psycopg2)
- 📋 Install ML libraries (surprise, implicit, scikit-learn)
- 📋 Create batch job script

### Phase 3: Collaborative Filtering (Week 3-4)
- 📋 Implement matrix factorization with `implicit` library
- 📋 Train on interaction data
- 📋 Generate recommendations for all users
- 📋 Store in PostgreSQL + cache in Redis

### Phase 4: Content-Based Filtering (Week 4)
- 📋 Extract event features (TF-IDF on descriptions)
- 📋 Build user profiles from interaction history
- 📋 Calculate similarity scores
- 📋 Integrate with collaborative filtering

### Phase 5: Social Boost (Week 5)
- 📋 Implement faculty/society matching
- 📋 Add co-attendance analysis
- 📋 Combine with other scores

### Phase 6: Integration & API (Week 5-6)
- 📋 Create REST API endpoint: `GET /api/recommendations/:userId`
- 📋 Integrate with Next.js frontend
- 📋 Add recommendation widgets to dashboard
- 📋 Implement impression tracking

### Phase 7: Analytics Dashboard (Week 6-7)
- 📋 Build society committee analytics
- 📋 Show impression/click rates
- 📋 Display recommendation sources
- 📋 A/B testing framework

### Phase 8: Optimization (Week 7-8)
- 📋 Performance tuning (batch job <30 seconds)
- 📋 Cold start handling
- 📋 Cache optimization
- 📋 Load testing

---

## 9. Deployment Strategy

### Docker Container Setup

```dockerfile
# Dockerfile.recommender
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY recommender/ ./recommender/

# Run batch job
CMD ["python", "-m", "recommender.batch_job"]
```

**requirements.txt:**
```
implicit==0.7.2
scikit-learn==1.4.0
pandas==2.2.0
psycopg2-binary==2.9.9
redis==5.0.1
numpy==1.26.3
```

### Docker Compose Integration

```yaml
# docker-compose.yml (excerpt)
services:
  recommender:
    build:
      context: .
      dockerfile: Dockerfile.recommender
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - postgres
      - redis
    networks:
      - ct216_network
    restart: unless-stopped

  # Cron job for batch updates
  recommender-cron:
    image: recommender:latest
    command: ["python", "-m", "recommender.cron"]
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - CRON_SCHEDULE=*/30 * * * *  # Every 30 minutes
    depends_on:
      - postgres
      - redis
    networks:
      - ct216_network
```

### Batch Job Schedule

```python
# recommender/cron.py
import schedule
import time
from recommender.batch_job import generate_all_recommendations

def job():
    print(f"Starting batch recommendation generation at {time.time()}")
    generate_all_recommendations()
    print("Batch job completed")

# Run every 30 minutes
schedule.every(30).minutes.do(job)

# Run immediately on startup
job()

while True:
    schedule.run_pending()
    time.sleep(60)  # Check every minute
```

### API Integration

```python
# Next.js API route: app/api/recommendations/[userId]/route.js
import { getRecommendations } from '@/lib/recommender';

export async function GET(request, { params }) {
    const { userId } = params;

    // Check Redis cache first
    const cached = await redis.get(`recommendations:${userId}`);
    if (cached) {
        return Response.json(JSON.parse(cached));
    }

    // Fallback to database
    const recommendations = await getRecommendations(userId);

    return Response.json(recommendations);
}
```

---

## Future Enhancements

### When to Consider Rust/C++ Migration

Revisit Rust implementation if:
- Batch job consistently takes >30 seconds
- Real-time recommendations needed (<100ms latency)
- Scaling beyond 10,000 active users
- Team gains Rust expertise

**Migration Path:**
1. Keep Python as orchestrator
2. Rewrite hot paths in Rust (matrix ops, similarity calculations)
3. Use [PyO3](https://pyo3.rs) for Python-Rust bindings
4. Benchmark before full migration

**Resources:**
- [sbr-rs: Rust recommendation library](https://github.com/maciejkula/sbr-rs)
- [Serving ML at the speed of Rust](https://shvbsle.in/serving-ml-at-the-speed-of-rust/)
- [Recommending books with Rust tutorial](https://maciejkula.github.io/2018/07/27/recommending-books-with-rust/)

### Advanced Features (Post-MVP)
- Deep learning models (TensorFlow/PyTorch)
- Multi-armed bandit for exploration/exploitation
- Contextual recommendations (time of day, location)
- Real-time updates (not batch)
- Explicit feedback collection (surveys)

---

## Related Documentation

- **[ARCHITECTURE.md](../ARCHITECTURE.md)** - Overall system design
- **[decisions/02_tech_stack.md](02_tech_stack.md)** - Why Python for recommendations
- **[decisions/03_database_design.md](03_database_design.md)** - Database schema details
- **[guides/redis_caching.md](../guides/redis_caching.md)** - Caching strategy

---

**Last Updated:** 2025-01-25
**Decision Status:** [x] Approved - Python-based hybrid recommender with Rust migration path
**References:**
- [PostgreSQL Rust driver](https://docs.rs/postgres)
- [sbr-rs recommendation library](https://github.com/maciejkula/sbr-rs)
- [ML performance in Rust](https://shvbsle.in/serving-ml-at-the-speed-of-rust/)
