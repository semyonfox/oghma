# MariaDB Migration Guide

This project uses **MariaDB** instead of PostgreSQL for native vector support needed by AI features.

## Why MariaDB?

- Native vector operations (better for AI/ML)
- Superior performance for vector embeddings
- Stores relational data just like PostgreSQL
- Better integration with AI recommendation systems

## Setup

1. **Local Development:**
   ```
   mysql://<redacted>
   ```

2. **Remote (via Tailscale):**
   ```
   mysql://<redacted>
   ```

3. **Run schema:**
   ```bash
   mysql < database/setup.sql
   ```

## Connection String Format

```
mysql://<redacted>
```

See `SETUP.md` for detailed configuration.
