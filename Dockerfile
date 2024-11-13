# Use an official Node.js runtime as the base image
FROM node:19-alpine

# Set the working directory in the container
WORKDIR /usr/src/app

RUN npm install -g pnpm

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install project dependencies
RUN pnpm install

# Copy the rest of the application code to the working directory

COPY . .

RUN npm run build

# Expose the port the app runs on
EXPOSE 31001
EXPOSE 31002
EXPOSE 31003

# Command to run your application
CMD ["node", "dist/index.js"]