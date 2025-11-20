#!/bin/bash
# Production deployment script for ct216-project
# Integrates with existing ct2106 stack

set -e

echo "🚀 Starting ct216 deployment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with your production configuration."
    echo "You can copy .env.production.template as a starting point."
    exit 1
fi

# Check if ct2106 network exists
if ! docker network inspect ct2106 >/dev/null 2>&1; then
    echo "❌ Error: ct2106 network not found!"
    echo "Please ensure your ct2106 stack is running first."
    exit 1
fi

# Build the Docker image
echo "📦 Building Docker image..."
docker compose build

# Stop existing container if running
if [ "$(docker ps -q -f name=ct216_web)" ]; then
    echo "🛑 Stopping existing container..."
    docker compose down
fi

# Start the new container
echo "🎯 Starting new container..."
docker compose up -d

# Wait for container to start
echo "⏳ Waiting for container to start..."
sleep 5

# Check if container is running
if [ "$(docker ps -q -f name=ct216_web)" ]; then
    echo "✅ Container is running!"
    echo ""
    echo "📊 Container status:"
    docker ps -f name=ct216_web
    echo ""
    echo "🔍 Health check:"
    sleep 3
    curl -s http://172.30.10.8:3000/api/health | jq '.' || echo "Health check endpoint not responding yet (this is normal, wait a moment)"
    echo ""
    echo "📝 View logs with: docker logs -f ct216_web"
    echo "🌐 App should be accessible via Cloudflare Tunnel at: https://your-domain.com"
else
    echo "❌ Container failed to start!"
    echo "📝 Check logs with: docker logs ct216_web"
    exit 1
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Network topology:"
echo "  100.118.61.122:2345 - PostgreSQL (external, via Tailscale)"
echo "  172.30.10.6         - pgAdmin (pgadmin-ct2106)"
echo "  172.30.10.7         - Redis (redis-ct2106)"
echo "  172.30.10.8         - ct216 Web App (ct216_web)"
echo ""
echo "Access your app at: https://your-domain.com"

