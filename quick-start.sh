#!/bin/bash

# Vaporform Quick Start Script
set -e

echo "=== Vaporform Quick Start ==="
echo ""

# Check if Docker is accessible
if ! docker ps > /dev/null 2>&1; then
    echo "❌ Docker is not accessible without sudo"
    echo ""
    echo "Please run these commands to fix permissions:"
    echo ""
    echo "  sudo usermod -aG docker \$USER"
    echo "  newgrp docker"
    echo ""
    echo "Then run this script again."
    exit 1
fi

echo "✓ Docker is accessible"
echo ""

# Start infrastructure
echo "Starting infrastructure services..."
cd /home/ssitzer/projects/vaporform
docker compose up -d

echo ""
echo "Waiting for services to be healthy (this may take 30 seconds)..."
sleep 10

# Check health
HEALTHY=0
for i in {1..20}; do
    POSTGRES=$(docker inspect vaporform-dev-postgres 2>/dev/null | grep '"Health"' -A 5 | grep '"Status"' | grep -c "healthy" || echo 0)
    MONGO=$(docker inspect vaporform-dev-mongodb 2>/dev/null | grep '"Health"' -A 5 | grep '"Status"' | grep -c "healthy" || echo 0)
    QDRANT=$(docker inspect vaporform-dev-qdrant 2>/dev/null | grep '"Health"' -A 5 | grep '"Status"' | grep -c "healthy" || echo 0)
    REDIS=$(docker inspect vaporform-dev-redis 2>/dev/null | grep '"Health"' -A 5 | grep '"Status"' | grep -c "healthy" || echo 0)

    TOTAL=$((POSTGRES + MONGO + QDRANT + REDIS))

    if [ $TOTAL -eq 4 ]; then
        HEALTHY=1
        break
    fi

    echo "  Waiting... ($TOTAL/4 services healthy)"
    sleep 3
done

echo ""
if [ $HEALTHY -eq 1 ]; then
    echo "✅ All infrastructure services are healthy!"
else
    echo "⚠️  Some services may still be starting. Check with: docker compose ps"
fi

echo ""
echo "=== Service Status ==="
docker compose ps

echo ""
echo "=== Connection Details ==="
echo "PostgreSQL: postgresql://vaporform:vaporform_dev_password@localhost:5432/vaporform"
echo "MongoDB:    mongodb://vaporform:vaporform_dev_password@localhost:27017/vaporform?authSource=admin"
echo "Qdrant:     http://localhost:6333"
echo "Redis:      redis://localhost:6379"

echo ""
echo "=== Next Steps ==="
echo "1. Update .env file with your API keys (OpenAI, Clerk)"
echo "2. Start Encore backend:"
echo "   cd /home/ssitzer/projects/vaporform"
echo "   encore run"
echo ""
echo "3. Start Next.js frontend (in another terminal):"
echo "   cd /home/ssitzer/projects/vaporform-frontend"
echo "   npm run dev"
echo ""
echo "4. Access:"
echo "   - Frontend: http://localhost:3000"
echo "   - API: http://127.0.0.1:4000"
echo "   - Encore Dashboard: http://127.0.0.1:9400"
