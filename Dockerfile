# Use an official Node.js runtime as the base image
FROM node:19

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install project dependencies
RUN yarn install --ignore-engines

# Copy the rest of the application code to the working directory
COPY . .

# Expose the port the app runs on
EXPOSE 3000
EXPOSE 31001


# Command to run your application
CMD ["node", "src/index.js"]