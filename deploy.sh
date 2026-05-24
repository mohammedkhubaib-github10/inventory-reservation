#!/bin/bash
set -e

echo "🚀 Starting automated deployment..."

# 1. Pull the latest code updates
if [ -d .git ]; then
  echo "📥 Pulling latest git updates..."
  git pull origin main
fi

# 2. Build and start the Docker containers
echo "📦 Building and starting Docker containers..."
docker compose down
docker compose up -d --build

# 3. Wait for database service healthcheck
echo "⌛ Waiting for database container to be healthy..."
until [ "$(docker inspect -f '{{.State.Health.Status}}' inventory-db)" == "healthy" ]; do
    sleep 1
done

# 4. Clean up old dangling images to preserve disk space
echo "🧹 Cleaning up unused Docker build cache and dangling images..."
docker image prune -f

echo "✅ Success! Application is running live on http://localhost:3001"
