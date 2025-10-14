#!/bin/bash

# Vaporform Health Check Script
# Verifies all services are running and accessible

set -e

DOMAIN="${BASE_DOMAIN:-vaporform.dev}"
COMPOSE_FILE="/opt/vaporform/docker-compose.prod.yml"

echo "=== Vaporform Health Check ==="
echo ""

# Function to check HTTP endpoint
check_http() {
  local name=$1
  local url=$2

  if curl -f -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|301\|302"; then
    echo "✓ $name: OK"
    return 0
  else
    echo "✗ $name: FAILED"
    return 1
  fi
}

# Function to check Docker container
check_container() {
  local name=$1

  if docker-compose -f "$COMPOSE_FILE" ps "$name" | grep -q "Up"; then
    echo "✓ Container $name: Running"
    return 0
  else
    echo "✗ Container $name: Not running"
    return 1
  fi
}

# Check Docker containers
echo "--- Docker Containers ---"
check_container "vaporform-traefik"
check_container "vaporform-postgres"
check_container "vaporform-mongodb"
check_container "vaporform-qdrant"
check_container "vaporform-redis"
check_container "vaporform-api"
check_container "vaporform-terminal"
check_container "vaporform-frontend"
echo ""

# Check HTTP endpoints
echo "--- HTTP Endpoints ---"
check_http "Frontend" "https://$DOMAIN"
check_http "API" "https://api.$DOMAIN/health"
check_http "WebSocket Terminal" "https://ws.$DOMAIN/health"
check_http "Traefik Dashboard" "https://traefik.$DOMAIN"
echo ""

# Check database connections
echo "--- Database Connections ---"
if docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U vaporform -d vaporform -c "SELECT 1" > /dev/null 2>&1; then
  echo "✓ PostgreSQL: Connected"
else
  echo "✗ PostgreSQL: Connection failed"
fi

if docker-compose -f "$COMPOSE_FILE" exec -T mongodb mongosh -u vaporform -p "$MONGO_PASSWORD" --authenticationDatabase admin --eval "db.adminCommand('ping')" > /dev/null 2>&1; then
  echo "✓ MongoDB: Connected"
else
  echo "✗ MongoDB: Connection failed"
fi

if docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli -a "$REDIS_PASSWORD" PING 2>/dev/null | grep -q "PONG"; then
  echo "✓ Redis: Connected"
else
  echo "✗ Redis: Connection failed"
fi

if curl -f -s "http://localhost:6333/collections" > /dev/null 2>&1; then
  echo "✓ Qdrant: Connected"
else
  echo "✗ Qdrant: Connection failed"
fi
echo ""

# Check SSL certificates
echo "--- SSL Certificates ---"
if openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" </dev/null 2>/dev/null | openssl x509 -noout -dates > /dev/null 2>&1; then
  EXPIRY=$(openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" </dev/null 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
  echo "✓ SSL Certificate: Valid (expires: $EXPIRY)"
else
  echo "✗ SSL Certificate: Invalid or missing"
fi
echo ""

# Check disk space
echo "--- Disk Space ---"
df -h / | awk 'NR==2 {print "Root: " $3 "/" $2 " used (" $5 ")"}'
df -h /var/lib/docker 2>/dev/null | awk 'NR==2 {print "Docker: " $3 "/" $2 " used (" $5 ")"}'
echo ""

# Check resource usage
echo "--- Resource Usage ---"
echo "CPU: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}')% used"
echo "Memory: $(free -m | awk 'NR==2{printf "%.0f%%", $3*100/$2 }')"
echo ""

echo "=== Health Check Complete ==="
