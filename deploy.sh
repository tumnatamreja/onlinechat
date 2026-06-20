#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     GhostLine — Auto Deploy VPS      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. System update + deps ─────────────────────────────────────────────
echo "→ Обновяване на системата..."
apt-get update -qq

echo "→ Инсталиране на зависимости..."
apt-get install -y -qq curl git ufw

# ── 2. Docker ────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "→ Инсталиране на Docker..."
  curl -fsSL https://get.docker.com | sh
else
  echo "→ Docker вече е инсталиран."
fi

if ! docker compose version &>/dev/null 2>&1; then
  echo "→ Инсталиране на Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin
fi

docker --version && docker compose version

# ── 3. Clone / update repo ───────────────────────────────────────────────
INSTALL_DIR="/opt/ghostline"
if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ Обновяване на репото..."
  git -C "$INSTALL_DIR" reset --hard HEAD
  git -C "$INSTALL_DIR" pull origin main
else
  echo "→ Клониране на репото..."
  git clone https://github.com/tumnatamreja/onlinechat.git "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo ""
echo "→ IP на сървъра: $SERVER_IP"

# ── 4. Secrets — these live in gitignored files, so `git reset --hard` +
#      `git pull` (step 3 above) NEVER touches or resets them. This is the
#      single source of truth across every re-run of this script. ─────────

# postgres.env — DB password, generated ONCE, persists forever after
if [ ! -f postgres.env ]; then
  echo "→ Първо стартиране — генериране на DB парола."
  echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" > postgres.env
else
  echo "→ Намерена съществуваща postgres.env — преизползва се."
fi
DB_PASS=$(grep POSTGRES_PASSWORD postgres.env | cut -d= -f2)

# server/.env — JWT secret, generated ONCE, persists forever after
if [ ! -f server/.env ] || ! grep -q "^JWT_SECRET=" server/.env; then
  echo "→ Генериране на JWT secret."
  JWT_SECRET=$(openssl rand -hex 32)
else
  JWT_SECRET=$(grep "^JWT_SECRET=" server/.env | head -1 | sed -E 's/JWT_SECRET="?([^"]*)"?/\1/')
fi

# Telegram credentials — preserved if already set (never overwritten with
# blanks on redeploy; set them once via VPS console, they stick forever)
if [ -f server/.env ] && grep -q "^TELEGRAM_BOT_TOKEN=" server/.env; then
  TG_TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" server/.env | head -1 | sed -E 's/TELEGRAM_BOT_TOKEN="?([^"]*)"?/\1/')
fi
if [ -f server/.env ] && grep -q "^TELEGRAM_ADMIN_CHAT_IDS=" server/.env; then
  TG_CHATS=$(grep "^TELEGRAM_ADMIN_CHAT_IDS=" server/.env | head -1 | sed -E 's/TELEGRAM_ADMIN_CHAT_IDS="?([^"]*)"?/\1/')
fi

# ── 5. Write server/.env (DATABASE_URL always derived fresh from postgres.env,
#      everything else preserved/regenerated as needed) ───────────────────
cat > server/.env << ENV
DATABASE_URL="postgresql://ghostline:${DB_PASS}@postgres:5432/ghostline"
JWT_SECRET="${JWT_SECRET}"
PORT=4000
CORS_ORIGIN="*"
UPLOADS_DIR="/app/uploads"
TELEGRAM_BOT_TOKEN="${TG_TOKEN}"
TELEGRAM_ADMIN_CHAT_IDS="${TG_CHATS}"
ENV

# ── 6. Client config.js ──────────────────────────────────────────────────
cat > client/public/config.js << CONF
window.GHOSTLINE_CONFIG = {
  serverUrl: 'http://${SERVER_IP}',
  label: 'Website Visitor',
};
CONF

# ── 7. Firewall ──────────────────────────────────────────────────────────
echo "→ Конфигуриране на firewall..."
ufw allow 22/tcp   >/dev/null 2>&1 || true
ufw allow 80/tcp   >/dev/null 2>&1 || true
ufw allow 443/tcp  >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

# ── 8. Build and start ────────────────────────────────────────────────────
echo "→ Build + стартиране (3-5 минути)..."
docker compose up -d --build

echo "→ Изчакване услугите да стартират..."
sleep 15

# ── 9. DB schema sync ──────────────────────────────────────────────────────
echo "→ Синхронизация на схемата на базата данни..."
docker compose exec -T server npx prisma db push --accept-data-loss 2>&1 | tail -5

sleep 3

# ── 10. Health check ────────────────────────────────────────────────────────
echo "→ Проверка..."
API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health 2>/dev/null)
CLIENT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null)

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           ИНСТАЛАЦИЯТА ЗАВЪРШИ                       ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
printf "║  Чат страница:  http://%-29s║\n" "${SERVER_IP}"
printf "║  Оператори:     http://%-29s║\n" "${SERVER_IP}:443"
echo "║                                                      ║"
echo "║  API статус:     HTTP ${API}                               ║"
echo "║  Client статус:  HTTP ${CLIENT}                               ║"
echo "║                                                      ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Първи оператор → http://${SERVER_IP}:443/setup"
echo ""
