# Roadmap

What's done and what's next.

## Done ✅
- [x] User registration
- [x] User login
- [x] Password hashing
- [x] JWT tokens
- [x] Session cookies

## Next up
- [ ] User dashboard/profile
- [ ] Logout button
- [ ] Protected routes
- [ ] Create events
- [ ] List events
- [ ] Register for events

## Database

**Current:**
```sql
-- Users
CREATE TABLE public.login (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Need to add:**
```sql
-- Events
CREATE TABLE public.events (
    event_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMP NOT NULL,
    location VARCHAR(255),
    capacity INT,
    created_by INT REFERENCES public.login(user_id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Registrations
CREATE TABLE public.registrations (
    registration_id SERIAL PRIMARY KEY,
    event_id INT REFERENCES public.events(event_id),
    user_id INT REFERENCES public.login(user_id),
    registered_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);
```


## 📚 Resources

- [Next.js Documentation](https://nextjs.org/docs)
- [PostgreSQL Tutorial](https://www.postgresql.org/docs/)
- [JWT Best Practices](https://jwt.io/introduction)
- [React Hooks Guide](https://react.dev/reference/react)

---

**Last Updated:** November 11, 2025

