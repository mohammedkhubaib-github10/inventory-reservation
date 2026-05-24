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

# 4. Run database migrations and seeding on host using correct Prisma version
echo "🗄️ Initializing schema and seeding database..."
npx prisma@6 db push
npx prisma@6 db seed

echo "✅ Success! Application is running live on http://localhost:3001"
