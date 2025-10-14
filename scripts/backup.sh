#!/bin/bash

# Vaporform Backup Script
# Backs up PostgreSQL, MongoDB, and deployment builds

set -e

BACKUP_DIR="/opt/vaporform/backups"
DATE=$(date +%F_%H-%M-%S)
COMPOSE_FILE="/opt/vaporform/docker-compose.prod.yml"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "=== Vaporform Backup Started: $DATE ==="

# Backup PostgreSQL
echo "Backing up PostgreSQL..."
docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U vaporform vaporform | gzip > "$BACKUP_DIR/postgres-$DATE.sql.gz"
echo "✓ PostgreSQL backup complete: postgres-$DATE.sql.gz"

# Backup MongoDB
echo "Backing up MongoDB..."
docker-compose -f "$COMPOSE_FILE" exec -T mongodb mongodump --authenticationDatabase admin -u vaporform -p "$MONGO_PASSWORD" --gzip --archive > "$BACKUP_DIR/mongodb-$DATE.archive.gz"
echo "✓ MongoDB backup complete: mongodb-$DATE.archive.gz"

# Backup deployment builds volume
echo "Backing up deployment builds..."
docker run --rm -v vaporform_deployment-builds:/data -v "$BACKUP_DIR":/backup alpine tar czf "/backup/builds-$DATE.tar.gz" -C /data .
echo "✓ Deployment builds backup complete: builds-$DATE.tar.gz"

# Calculate sizes
PG_SIZE=$(du -h "$BACKUP_DIR/postgres-$DATE.sql.gz" | cut -f1)
MONGO_SIZE=$(du -h "$BACKUP_DIR/mongodb-$DATE.archive.gz" | cut -f1)
BUILDS_SIZE=$(du -h "$BACKUP_DIR/builds-$DATE.tar.gz" | cut -f1)

echo ""
echo "=== Backup Summary ==="
echo "PostgreSQL: $PG_SIZE"
echo "MongoDB: $MONGO_SIZE"
echo "Builds: $BUILDS_SIZE"
echo "Location: $BACKUP_DIR"

# Clean up old backups (keep last 7 days)
echo ""
echo "Cleaning up old backups (>7 days)..."
find "$BACKUP_DIR" -type f -mtime +7 -delete
echo "✓ Cleanup complete"

# Upload to S3 (optional - uncomment if configured)
# echo "Uploading to S3..."
# aws s3 sync "$BACKUP_DIR" s3://vaporform-backups/$(date +%Y/%m)/ --exclude "*" --include "*$DATE*"
# echo "✓ S3 upload complete"

echo ""
echo "=== Backup Complete: $DATE ==="
