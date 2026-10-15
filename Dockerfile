# syntax=docker/dockerfile:1
# Stage 1: Builder
FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS builder
WORKDIR /app
# Install build tools for native modules (e.g., bcrypt)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* .npmrc* ./
RUN npm pkg delete scripts.prepare && npm ci
COPY . .
# Fetch the pinned Android release before Next.js indexes public files.
RUN node scripts/fetch-mobile-apk.mjs
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Stub DATABASE_URL for build time (actual URL provided at runtime via env vars)
ENV DATABASE_URL=postgresql://build:***@localhost:5432/build
ARG NEXT_PUBLIC_SENTRY_DSN
ARG SENTRY_ENVIRONMENT=production
ARG SENTRY_RELEASE
ARG SENTRY_TRACES_SAMPLE_RATE=0.1
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_SENTRY_RELEASE=$SENTRY_RELEASE
ENV NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=$SENTRY_TRACES_SAMPLE_RATE
ENV SENTRY_RELEASE=$SENTRY_RELEASE
# the upload token exists only for this build step, never in an image layer
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN npm run build

# Stage 2: Runner
FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ARG SENTRY_ENVIRONMENT=production
ARG SENTRY_RELEASE
ENV SENTRY_ENVIRONMENT=$SENTRY_ENVIRONMENT
ENV SENTRY_RELEASE=$SENTRY_RELEASE
# Ensure Next.js binds to all interfaces inside container
ENV HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs --create-home nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# scripts/ and database/migrations/ are needed at startup for the prebuild-migrate
# step in the Jenkins pipeline (runs against a live DB before app deploy).
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/database/migrations ./database/migrations
COPY --from=builder /app/node_modules/postgres ./node_modules/postgres
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
