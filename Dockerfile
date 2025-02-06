# Stage 1: Build Stage
FROM node:20-alpine AS builder

# Set the working directory
WORKDIR /usr/src/app

# Install pnpm globally
RUN npm install -g pnpm

# Install build tools for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cmake

# Copy package.json and pnpm-lock.yaml to leverage Docker cache for dependencies
COPY package.json pnpm-lock.yaml ./

# Install all dependencies
RUN pnpm install

# Copy the rest of the application code to the working directory
COPY . .

# Build the project
RUN npm run build

# Stage 2: Production Stage
FROM node:20-alpine

# Set the working directory
WORKDIR /usr/src/app

# Install runtime dependencies for native modules (if needed)
RUN apk add --no-cache \
    libstdc++

# Copy only the production dependencies and built files from the builder stage
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/app/dist /usr/src/app/dist
COPY --from=builder /usr/src/app/package.json /usr/src/app/package.json

# Expose the necessary ports
EXPOSE 31001 31002 31003

# Command to run the application
CMD ["node", "dist/index.js"]