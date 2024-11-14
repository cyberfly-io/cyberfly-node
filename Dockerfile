# Stage 1: Build Stage
FROM node:19-alpine AS builder

WORKDIR /usr/src/app

# Use a specific version of pnpm for better reproducibility
RUN npm install -g pnpm

# Copy only package files first to leverage cache
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including dev dependencies) for building
RUN pnpm install

COPY . .

# Build the project
RUN npm run build

# Stage 2: Dependencies Stage
FROM node:19-alpine AS deps

WORKDIR /usr/src/app

RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install ONLY production dependencies
RUN pnpm install --prod

# Stage 3: Production Stage
FROM node:19-alpine AS runner

# Add a non-root user
RUN addgroup -S appuser && \
    adduser -S appuser -G appuser

WORKDIR /usr/src/app

# Copy only the necessary files from builder and deps
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package.json ./

# Use non-root user
USER appuser

# Expose ports as a single layer
EXPOSE 31001 31002 31003

# Command to run the application
CMD ["node", "dist/index.js"]