# syntax=docker/dockerfile:1
# Stage 1: Builder
FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS builder
WORKDIR /app
# Install build tools for native modules (e.g., bcrypt)
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm pkg delete scripts.prepare && npm ci
# fetch the pinned Android release before the source copy, so ordinary source
# changes reuse the verified download instead of fetching it again
COPY scripts/fetch-mobile-apk.mjs ./scripts/
COPY public/downloads/android-alpha.json ./public/downloads/
RUN node scripts/fetch-mobile-apk.mjs
COPY . .
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
# .next/cache holds the Turbopack build cache between image builds. it is a
# mount, so it never lands in an image layer
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    --mount=type=cache,target=/app/.next/cache,id=oghma-next-cache,sharing=locked \
    npm run build

# Stage 2: Runner
FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runner
WORKDIR /app
# the browser reads its sentry environment from the host and the server from
# runtime env, so the deploy pipeline may promote this image from dev to prod
LABEL oghma.runtime-env="1"
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

# --chown on each copy instead of a recursive chown afterwards, which duplicated
# every copied file into another layer. /app itself stays writable for logs/
RUN chown nextjs:nodejs /app
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# scripts/ and database/migrations/ are needed at startup for the prebuild-migrate
# step in the Jenkins pipeline (runs against a live DB before app deploy).
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=builder --chown=nextjs:nodejs /app/database/migrations ./database/migrations
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
