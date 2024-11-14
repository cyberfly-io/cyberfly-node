# Stage 1: Build Stage
FROM node:19-alpine AS builder

WORKDIR /usr/src/app

# Install pnpm
RUN npm install -g pnpm

# Copy only package files first to leverage cache
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies) for building
RUN pnpm install --frozen-lockfile 

COPY . .

# Build the project
RUN pnpm run build

# Stage 2: Dependencies Stage
FROM node:19-alpine AS deps

WORKDIR /usr/src/app

# Install pnpm and modclean
RUN npm install -g pnpm modclean

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production dependencies and clean up
RUN pnpm install --prod --frozen-lockfile && \
    modclean -r -n default:safe && \
    rm -rf /root/.cache && \
    rm -rf /root/.npm && \
    rm -rf /root/.pnpm-store

# Stage 3: Production Stage
FROM node:19-alpine AS runner

# Add a non-root user and set up workdir in a single layer
RUN addgroup -S appuser && \
    adduser -S appuser -G appuser && \
    mkdir -p /usr/src/app && \
    chown -R appuser:appuser /usr/src/app

WORKDIR /usr/src/app

# Copy only the necessary files from builder and deps
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./

# Use non-root user
USER appuser

# Set Node environment
ENV NODE_ENV=production

# Expose ports as a single layer
EXPOSE 31001 31002 31003

# Command to run the application
CMD ["node", "dist/index.js"]