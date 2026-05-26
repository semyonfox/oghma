# Operational Guidelines for Agents

## Critical Rules

### 1. Development Server

- **Assume** `npm run dev` is always running in background
- **Never restart or modify** the dev server unless explicitly instructed
- Check `/tmp/dev.pid` for current process status if needed

### 2. Git Safety Protocol

- **Never execute destructive git operations** without verified backup strategy
- All staged changes must be committed or stashed before any risky operations
- Verify `git status` shows clean working tree or all files are staged before:
  - Rebasing, resetting, or force-pushing
  - Switching branches with uncommitted changes
  - Running migrations or data transformations
- Maintain git reflogs/stash as fallback recovery mechanism
- For complex operations, create temporary commit first, then amend/squash if needed

### 3. Package Manager

- **Use `npm` only** — do not use `pnpm` or `yarn`
- All install/run commands must use `npm install`, `npm run`, etc.

### 4. Branch & Deploy Strategy

- **`main`** is the production branch — deployed to oghmanotes.ie by Jenkins onto the homelab Docker stack
- **`dev`** is the development branch — deployed to dev.oghmanotes.ie by Jenkins onto the homelab Docker stack
- deploy flow: `dev` → `main` (via PR)
- never push directly to `main` — always go through PR with required status checks
- **Jenkins jobs**: `oghma-prod` tracks `main`; `oghma-dev` tracks `dev`. GitHub webhook → `https://jenkins.semyon.ie/github-webhook/`
- **Runtime env**: `/home/semyon/jenkins/env/oghma-prod.env` and `/home/semyon/jenkins/env/oghma-dev.env` on the homelab. App and worker containers both read these files.
- **Homelab stack**: persistent services live under `/home/semyon/server-stacks/oghma/` (`oghma-postgres`, `oghma-redis`, `oghma-rustfs`, `oghma-nginx`, Cloudflare tunnel containers). App/worker containers are replaced by Jenkins.
- **Migrations**: Jenkins runs `node scripts/prebuild-migrate.mjs` before deploying the app image. It uses `MIGRATION_DATABASE_URL` from the Jenkins env file and records applied migrations in `app.schema_migrations`.
- **Migration numbering**: migrations `001-017` are legacy/bootstrap; newer migrations continue from the highest existing number in `database/migrations/`.
- **AWS role now**: AWS is not the app host. It is kept for Route 53/SES and any explicitly documented external services.

### 5. Code Changes

- Never silently drop uncommitted work
- Always verify file staging status before operations that affect the working tree
- If unsure about data safety, create a backup branch or stash first
