#!/bin/bash

# Start Vaporform Infrastructure Services
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "=== Starting Vaporform Infrastructure ==="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not accessible. You may need to:"
    echo "   1. Add your user to docker group: sudo usermod -aG docker \$USER"
    echo "   2. Log out and log back in, OR run: newgrp docker"
    echo "   3. Alternatively, run with sudo (not recommended)"
    exit 1
fi

# Start services
echo "Starting services..."
docker compose -f "$SCRIPT_DIR/docker-compose.yml" up -d

echo ""
echo "=== Waiting for services to be healthy ==="
echo ""

# Wait for PostgreSQL
echo -n "PostgreSQL: "
for i in {1..30}; do
    if docker exec vaporform-dev-postgres pg_isready -U vaporform > /dev/null 2>&1; then
        echo "✓ Ready"
        break
    fi
    sleep 1
    echo -n "."
done

# Wait for MongoDB
echo -n "MongoDB: "
for i in {1..30}; do
    if docker exec vaporform-dev-mongodb mongosh --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
        echo "✓ Ready"
        break
    fi
    sleep 1
    echo -n "."
done

# Wait for Qdrant
echo -n "Qdrant: "
for i in {1..30}; do
    if curl -f -s http://localhost:6333/health > /dev/null 2>&1; then
        echo "✓ Ready"
        break
    fi
    sleep 1
    echo -n "."
done

# Wait for Redis
echo -n "Redis: "
for i in {1..30}; do
    if docker exec vaporform-dev-redis redis-cli ping > /dev/null 2>&1; then
        echo "✓ Ready"
        break
    fi
    sleep 1
    echo -n "."
done

echo ""
echo "=== Infrastructure Status ==="
docker compose -f "$SCRIPT_DIR/docker-compose.yml" ps

echo ""
echo "=== Connection Details ==="
echo "PostgreSQL: postgresql://vaporform:vaporform_dev_password@localhost:5432/vaporform"
echo "MongoDB:    mongodb://vaporform:vaporform_dev_password@localhost:27017/vaporform?authSource=admin"
echo "Qdrant:     http://localhost:6333"
echo "Redis:      redis://localhost:6379"
echo ""
echo "✅ All infrastructure services are running!"
