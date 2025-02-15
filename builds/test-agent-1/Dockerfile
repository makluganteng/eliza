
FROM eliza:latest as base

WORKDIR /app/custom-agent

# Copy generated agent files
COPY . .

# Install dependencies
RUN pnpm install

# Build the agent
RUN pnpm run build

# Create data directory
RUN mkdir -p data

# Expose agent port
EXPOSE 3000

# Start the agent
CMD ["pnpm", "start"]
