#!/bin/bash
set -e

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     GhostLine — Auto Deploy VPS      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. System update + deps ─────────────────────────────────────────────
echo "→ Обновяване на системата..."
apt-get update -qq && apt-get upgrade -y -qq

echo "→ Инсталиране на зависимости..."
apt-get install -y -qq curl git ufw

# ── 2. Docker ────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "→ Инсталиране на Docker..."
  curl -fsSL https://get.docker.com | sh
else
  echo "→ Docker вече е инсталиран."
fi

if ! command -v docker compose &>/dev/null 2>&1; then
  echo "→ Инсталиране на Docker Compose plugin..."
  apt-get install -y -qq docker-compose-plugin
fi

docker --version
docker compose version

# ── 3. Clone repo ────────────────────────────────────────────────────────
INSTALL_DIR="/opt/ghostline"

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "→ Обновяване на репото..."
  git -C "$INSTALL_DIR" pull
else
  echo "→ Клониране на репото..."
  git clone https://github.com/tumnatamreja/onlinechat.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── 4. Generate secrets ──────────────────────────────────────────────────
JWT_SECRET=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -hex 16)
SERVER_IP=$(curl -s ifconfig.me)

echo ""
echo "→ IP на сървъра: $SERVER_IP"

# ── 5. Write server/.env ─────────────────────────────────────────────────
cat > server/.env << ENV
DATABASE_URL="postgresql://ghostline:${DB_PASS}@postgres:5432/ghostline"
JWT_SECRET="${JWT_SECRET}"
PORT=4000
CORS_ORIGIN="*"
UPLOADS_DIR="/app/uploads"
TELEGRAM_BOT_TOKEN=""
TELEGRAM_ADMIN_CHAT_IDS=""
ENV

echo "→ server/.env записан."

# ── 6. Write docker-compose override (use generated DB pass) ────────────
sed -i "s/POSTGRES_PASSWORD: changeme/POSTGRES_PASSWORD: ${DB_PASS}/" docker-compose.yml
sed -i "s|postgresql://ghostline:changeme@|postgresql://ghostline:${DB_PASS}@|" docker-compose.yml

# ── 7. Write client/public/config.js ────────────────────────────────────
cat > client/public/config.js << CONF
window.GHOSTLINE_CONFIG = {
  serverUrl: 'http://${SERVER_IP}:4000',
  label: 'Website Visitor',
};
CONF

echo "→ client/public/config.js записан."

# ── 8. Operator env ─────────────────────────────────────────────────────
cat > operator/.env.local << OPE
NEXT_PUBLIC_API_URL=http://${SERVER_IP}:4000
OPE

# ── 9. Firewall ──────────────────────────────────────────────────────────
echo "→ Конфигуриране на firewall..."
ufw allow 22/tcp   >/dev/null 2>&1
ufw allow 80/tcp   >/dev/null 2>&1
ufw allow 443/tcp  >/dev/null 2>&1
ufw allow 4000/tcp >/dev/null 2>&1
ufw allow 3000/tcp >/dev/null 2>&1
ufw allow 8080/tcp >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1

# ── 10. Build and start ──────────────────────────────────────────────────
echo "→ Build + стартиране (може да отнеме 3-5 минути)..."
docker compose up -d --build

echo "→ Изчакване услугите да стартират..."
sleep 10

# ── 11. DB migrations ────────────────────────────────────────────────────
echo "→ Миграции на базата данни..."
sleep 5
docker compose exec -T server npx prisma migrate deploy 2>/dev/null || \
docker compose exec -T server npx prisma db push 2>/dev/null || true

# ── 12. Health check ─────────────────────────────────────────────────────
echo ""
echo "→ Проверка на услугите..."
sleep 5

API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health 2>/dev/null)
CLIENT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080 2>/dev/null)
OPERATOR_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null)

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║              ИНСТАЛАЦИЯТА ЗАВЪРШИ               ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
printf  "║  API сървър:   http://%-26s║\n" "${SERVER_IP}:4000  "
printf  "║  Чат страница: http://%-26s║\n" "${SERVER_IP}:8080  "
printf  "║  Оператори:    http://%-26s║\n" "${SERVER_IP}:3000  "
echo "║                                                  ║"
echo "║  API статус:      HTTP $API_STATUS                         ║"
echo "║  Client статус:   HTTP $CLIENT_STATUS                         ║"
echo "║  Operator статус: HTTP $OPERATOR_STATUS                         ║"
echo "║                                                  ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║  СЛЕДВАЩА СТЪПКА: Създай оператор акаунт        ║"
echo "║  Виж: /opt/ghostline/INSTALL.md  →  Стъпка 5   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "JWT_SECRET (запази го!): ${JWT_SECRET}"
echo ""
