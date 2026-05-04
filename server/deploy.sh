#!/bin/bash
# ─────────────────────────────────────────────────────────────
# SyncRoom — Oracle Cloud One-Command Deploy Script
# Run on your Oracle VM:  bash deploy.sh
# ─────────────────────────────────────────────────────────────

set -e  # Exit on any error

REPO_URL="https://github.com/YOUR_USERNAME/YOUR_REPO.git"  # ← Replace with your GitHub repo URL
SERVER_DIR="$HOME/syncroom/server"

echo "═══════════════════════════════════════════"
echo " SyncRoom Server — Oracle Cloud Deployment"
echo "═══════════════════════════════════════════"

# 1. Update system
echo "[1/7] Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo "[2/7] Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo "  ✅ Docker installed. NOTE: Log out and back in if this is the first install."
else
  echo "[2/7] Docker already installed ✅"
fi

# 3. Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
  echo "[3/7] Installing Docker Compose..."
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  echo "  ✅ Docker Compose installed"
else
  echo "[3/7] Docker Compose already installed ✅"
fi

# 4. Clone or pull latest code
echo "[4/7] Pulling latest code..."
if [ -d "$HOME/syncroom/.git" ]; then
  cd "$HOME/syncroom" && git pull
else
  git clone "$REPO_URL" "$HOME/syncroom"
fi

# 5. Check .env exists
echo "[5/7] Checking .env..."
if [ ! -f "$SERVER_DIR/.env" ]; then
  echo ""
  echo "  ⚠️  .env file not found at $SERVER_DIR/.env"
  echo "  Please create it with your Oracle VM public IP:"
  echo ""
  echo "  cp $SERVER_DIR/.env.example $SERVER_DIR/.env"
  echo "  nano $SERVER_DIR/.env"
  echo ""
  exit 1
fi
echo "  ✅ .env found"

# 6. Build and start containers
echo "[6/7] Building and starting Docker containers..."
cd "$SERVER_DIR"
docker-compose down --remove-orphans 2>/dev/null || true
docker-compose up -d --build

# 7. Verify
echo "[7/7] Verifying deployment..."
sleep 5
if docker-compose ps | grep -q "Up"; then
  PUBLIC_IP=$(curl -s http://api.ipify.org)
  echo ""
  echo "╔═══════════════════════════════════════════════╗"
  echo "║  ✅  SyncRoom Server is LIVE!                 ║"
  echo "║                                               ║"
  echo "║  Backend URL: http://$PUBLIC_IP:3001          ║"
  echo "║  Health:      http://$PUBLIC_IP:3001/health   ║"
  echo "╚═══════════════════════════════════════════════╝"
  echo ""
  echo "  Next: Update VITE_SOCKET_URL in your Vercel dashboard to:"
  echo "  http://$PUBLIC_IP:3001"
else
  echo "  ❌ Container failed to start. Check logs:"
  echo "  docker-compose logs --tail=50"
fi
