#!/bin/bash

# Add current user to docker group
echo "Adding user to docker group..."
sudo usermod -aG docker $USER

echo ""
echo "✓ User added to docker group"
echo ""
echo "IMPORTANT: You need to log out and log back in for group changes to take effect."
echo "Alternatively, run: newgrp docker"
echo ""
echo "After that, run: docker compose -f /home/ssitzer/projects/vaporform/docker-compose.yml up -d"
