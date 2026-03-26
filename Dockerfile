# Stage 1: Dependencies
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* .npmrc* ./
RUN npm pkg delete scripts.prepare && npm ci --only=production && npm cache clean --force

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app
# Install build tools for native modules (e.g., bcrypt)
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json* .npmrc* ./
RUN npm pkg delete scripts.prepare && npm ci
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Stub DATABASE_URL for build time (actual URL provided at runtime via env vars)
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
# Use standard Next.js build (not Turbopack) to ensure .next/standalone is created
RUN npx next build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Ensure Next.js binds to all interfaces inside container
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# aws-ssl-profiles is not traced by Next.js standalone output, copy it manually
COPY --from=deps /app/node_modules/aws-ssl-profiles ./node_modules/aws-ssl-profiles
RUN chown -R nextjs:nodejs /app
USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "server.js"]
