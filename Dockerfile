# Stage 1: Install dependencies
FROM node:18-alpine AS deps
# Add libc6-compat for Next.js features
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy dependency configs
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm install

# Stage 2: Build the application
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client schema types and binary engines
RUN npx prisma generate

# Build Next.js standalone application using compiler cache mount
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN --mount=type=cache,target=/app/.next/cache npm run build

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

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start Next.js standalone server
CMD ["node", "server.js"]
