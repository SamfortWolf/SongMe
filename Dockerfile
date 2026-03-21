FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci

# Copy the rest of the project
COPY . .

# Build the Vite frontend
RUN npm run build

# Expose standard Cloud Run port
EXPOSE 8080

# Environment variables for production mapping
ENV PORT=8080
ENV NODE_ENV=production

# Start the bundled app (Express backend serving static frontend)
CMD ["npx", "tsx", "server.ts"]
