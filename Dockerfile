# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /usr/src/app

# Only dependency manifests first (better layer cache)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Build (outputs to dist/)
RUN npm run build

# Stage 2: Production runtime (minimal)
FROM node:22-alpine AS runtime
WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy only package manifests, install prod deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy built app
COPY --from=builder /usr/src/app/dist ./dist

# (Optional) create non-root user
RUN addgroup -S app && adduser -S app -G app
USER app

EXPOSE 31001 31002 31003
CMD ["node", "dist/index.js"]

# --- Optional Distroless final stage (uncomment to use) ---
# FROM gcr.io/distroless/nodejs22-debian12 AS distroless
# WORKDIR /app
# COPY --from=runtime /usr/src/app /app
# USER 1000
# EXPOSE 31001 31002 31003
# CMD ["dist/index.js"]