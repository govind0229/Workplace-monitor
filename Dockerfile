# Build stage
FROM node:20-slim AS build
# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --only=production

# Final stage
FROM node:20-slim
WORKDIR /usr/src/app

# Install runtime dependencies for notifications and healthcheck
RUN apt-get update && apt-get install -y \
    libnotify-bin \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /usr/src/app/node_modules ./node_modules
COPY . .

# Expose port
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/status || exit 1

# Start the server
CMD [ "node", "server.js" ]
