# Use a specific Node.js version for better reproducibility
FROM node:23.3.0-slim AS builder

# Install pnpm globally and necessary build tools
RUN apt-get update && \
    apt-get install -y gpg && \
    apt-key update && \
    apt-get update --allow-insecure-repositories && \
    apt-get install -y --allow-unauthenticated \
    pnpm \
    git \
    python3 \
    python3-pip \
    curl \
    node-gyp \
    ffmpeg \
    libtool-bin \
    autoconf \
    automake \
    libopus-dev \
    make \
    g++ \
    build-essential \
    libcairo2-dev \
    libjpeg-dev \
    libpango1.0-dev \
    libgif-dev \
    openssl \
    libssl-dev libsecret-1-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    npm install -g pnpm@9.15.4

# Set Python 3 as the default python
RUN ln -sf /usr/bin/python3 /usr/bin/python

# Set the working directory
WORKDIR /app

# Copy application code
COPY . .

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Build the project including any generated agents
RUN pnpm run build

# Build generated agents if they exist
RUN if [ -d "agent/generated" ]; then \
    for agent in agent/generated/*; do \
        if [ -d "$agent" ]; then \
            cd "$agent" && \
            pnpm install && \
            pnpm run build && \
            cd /app; \
        fi \
    done \
fi

# Final runtime image
FROM node:23.3.0-slim

# Install runtime dependencies
RUN npm install -g pnpm@9.15.4 && \
    apt-get update && \
    apt-get install -y \
    git \
    python3 \
    ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

# Copy built artifacts and production dependencies from the builder stage
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/.npmrc ./
COPY --from=builder /app/turbo.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/agent ./agent
COPY --from=builder /app/client ./client
COPY --from=builder /app/lerna.json ./
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/characters ./characters

# Expose necessary ports
EXPOSE 3000 5173

# Command to start the application
CMD ["sh", "-c", "pnpm start & pnpm start:client"]
