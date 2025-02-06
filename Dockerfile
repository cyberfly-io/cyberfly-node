# Stage 1: Build Stage
FROM node:22-slim AS builder

# Install system dependencies required for native module compilation
RUN apt-get update && apt-get install -y cmake make g++ python3

# Set the working directory
WORKDIR /usr/src/app

# Install pnpm globally
RUN npm install -g pnpm

# Copy package.json and pnpm-lock.yaml to leverage Docker cache for dependencies
COPY package.json pnpm-lock.yaml ./

# Install dependencies (force native module compilation)
RUN pnpm install --ignore-scripts && \
    pnpm rebuild node-datachannel && \
    pnpm exec node-gyp rebuild

# Copy the rest of the application code
COPY . .

# Build the project
RUN npm run build

# Verify the compiled module exists
RUN ls -l /usr/src/app/node_modules/node-datachannel/build/Release/

# Stage 2: Production Stage
FROM node:22-slim

# Set the working directory
WORKDIR /usr/src/app

# Install pnpm globally
RUN npm install -g pnpm

# Copy compiled dependencies
COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules
COPY --from=builder /usr/src/app/dist /usr/src/app/dist
COPY --from=builder /usr/src/app/package.json /usr/src/app/package.json

# Verify if `node_datachannel.node` exists in the final image
RUN ls -l /usr/src/app/node_modules/node-datachannel/build/Release/

# Expose the necessary ports
EXPOSE 31001 31002 31003

# Command to run the application
CMD ["node", "dist/index.js"]
