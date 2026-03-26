#!/bin/bash
# Production deployment script

set -e

echo "🚀 Starting deployment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please create a .env file with your production configuration."
    echo "You can copy .env.production.template as a starting point."
    exit 1
fi

# Check if docker network exists
if ! docker network inspect your-network >/dev/null 2>&1; then
    echo "❌ Error: Docker network not found!"
    echo "Please ensure your stack is running first."
    exit 1
fi

# Build the Docker image
echo "📦 Building Docker image..."
docker compose build

# Stop existing container if running
if [ "$(docker ps -q -f name=your-app-web)" ]; then
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
if [ "$(docker ps -q -f name=your-app-web)" ]; then
    echo "✅ Container is running!"
    echo ""
    echo "📊 Container status:"
    docker ps -f name=your-app-web
    echo ""
    echo "🔍 Health check:"
    sleep 3
    curl -s http://your-internal-ip:3000/api/health | jq '.' || echo "Health check endpoint not responding yet (this is normal, wait a moment)"
    echo ""
    echo "📝 View logs with: docker logs -f your-app-web"
    echo "🌐 App should be accessible via Cloudflare Tunnel at: https://your-domain.com"
else
    echo "❌ Container failed to start!"
    echo "📝 Check logs with: docker logs your-app-web"
    exit 1
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Network topology:"
echo "  your-tailscale-ip:2345 - PostgreSQL (external, via Tailscale)"
echo "  your-internal-ip       - pgAdmin"
echo "  your-internal-ip       - Redis"
echo "  your-internal-ip       - Web App"
echo ""
echo "Access your app at: https://your-domain.com"