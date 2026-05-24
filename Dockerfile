# Stage 1: Build the application
FROM node:18-alpine AS builder
# Add libc6-compat for Next.js features
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy dependency configs and install (no multi-stage copy of node_modules)
COPY package.json package-lock.json ./
RUN npm install

# Copy application source code
COPY . .

# Generate Prisma Client schema types and binary engines
RUN npx prisma generate

# Build Next.js standalone application
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Stage 3: Runner stage (clean, minimal container runtime)
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Configure non-root system user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set up stand-alone directory assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Install lightweight Prisma CLI inside the runner stage for startup push
USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV npm_config_cache=/tmp/.npm

# Automatically sync database schema on startup and run the standalone server
CMD npx prisma db push --accept-data-loss && node server.js
