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
- **`main`** is the production branch — deployed to oghmanotes.ie via AWS Amplify
- **`dev`** is the development branch — deployed to dev.oghmanotes.ie
- deploy flow: `dev` → `main` (via PR)
- never push directly to `main` — always go through PR with required status checks

### 5. Code Changes
- Never silently drop uncommitted work
- Always verify file staging status before operations that affect the working tree
- If unsure about data safety, create a backup branch or stash first
