# OghmaNotes

OghmaNotes is a study workspace that turns notes, files, and Canvas LMS content into a searchable learning system.

## What it does

- Organises notes and folders with Markdown and rich-text editing
- Imports Canvas courses, files, and assignments in background jobs
- Searches notes and extracted documents with keyword and semantic retrieval
- Answers questions with citations to the user's own material
- Generates quizzes and FSRS-based flashcard reviews
- Tracks assignments, study blocks, Pomodoro sessions, and calendar exports
- Imports and exports Markdown/Obsidian-style vaults

## Run it locally

The supported self-contained path uses disposable mock services and synthetic data:

```bash
npm install
cp .env.mock.example .env.mock
npm run mock:up
npm run mock:seed
npm run dev:mock
```

Open `http://127.0.0.1:3311`. See [SETUP.md](SETUP.md) for the test login, real-service configuration, worker commands, and cleanup.

## Architecture at a glance

- Next.js 16 and React 19 provide the web app and API routes.
- PostgreSQL stores relational data; Qdrant stores chunk vectors.
- S3-compatible object storage holds notes, uploads, and exports.
- Redis and BullMQ run the current background queues behind a provider abstraction.
- A separate worker handles Canvas imports, extraction, indexing, and vault jobs.

Production and development currently run on the homelab Docker/Jenkins stack described in [infra/HOMELAB.md](infra/HOMELAB.md). Future hosting decisions belong in [infra/TARGET_HOSTING.md](infra/TARGET_HOSTING.md), not in this overview.

## Documentation

Start with the [documentation index](docs/README.md). The main entry points are:

- [Product roadmap](docs/product/roadmap.md)
- [Launch checklist](docs/product/launch-checklist.md)
- [Current architecture](docs/engineering/architecture.md)
- [Current operations](infra/README.md)

Repository operating rules for coding agents live in [AGENTS.md](AGENTS.md).

## Credits

OghmaNotes began as a University of Galway team project by Samuel Regan, Semyon Fox, and Shreyansh Singh. Its editor foundation is based on the MIT-licensed Notea project.
