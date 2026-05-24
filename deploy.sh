#!/bin/bash
set -e

# Define cleanup function
cleanup() {
  echo "🧹 Cleaning up unused Docker containers, build cache, and images..."
  docker system prune -f
  docker builder prune -a -f
}

# Run cleanup automatically when the script exits (success or failure)
trap cleanup EXIT

echo "🚀 Starting automated deployment..."

# 1. Clean up first to free up space for the build
cleanup

# 2. Pull the latest code updates
if [ -d .git ]; then
  echo "📥 Pulling latest git updates..."
  git pull origin main
fi

# 3. Pull and start the Docker containers
echo "📦 Pulling and starting Docker containers..."
docker compose down
docker compose pull
docker compose up -d

# 4. Wait for database service healthcheck
echo "⌛ Waiting for database container to be healthy..."
until [ "$(docker inspect -f '{{.State.Health.Status}}' inventory-db)" == "healthy" ]; do
    sleep 1
done

echo "✅ Success! Application is running live on http://localhost:3001"
