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
  git -C "$INSTALL_DIR" pull
else
  echo "→ Клониране на репото..."
  git clone https://github.com/tumnatamreja/onlinechat.git "$INSTALL_DIR"
fi
cd "$INSTALL_DIR"

# ── 4. Generate secrets ──────────────────────────────────────────────────
JWT_SECRET=$(openssl rand -hex 32)
DB_PASS=$(openssl rand -hex 16)
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

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

# ── 6. Update docker-compose DB password ────────────────────────────────
sed -i "s/POSTGRES_PASSWORD: changeme/POSTGRES_PASSWORD: ${DB_PASS}/" docker-compose.yml

# ── 7. Operator env — API URL via nginx on port 80 ───────────────────────
sed -i "s|REPLACE_WITH_API_URL|http://${SERVER_IP}|" docker-compose.yml

# ── 8. Client config.js ──────────────────────────────────────────────────
cat > client/public/config.js << CONF
window.GHOSTLINE_CONFIG = {
  serverUrl: 'http://${SERVER_IP}',
  label: 'Website Visitor',
};
CONF

# ── 9. Firewall ──────────────────────────────────────────────────────────
echo "→ Конфигуриране на firewall..."
ufw allow 22/tcp   >/dev/null 2>&1 || true
ufw allow 80/tcp   >/dev/null 2>&1 || true
ufw allow 443/tcp  >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

# ── 10. Build and start ──────────────────────────────────────────────────
echo "→ Спиране на стари контейнери (ако има)..."
docker compose down 2>/dev/null || true

echo "→ Build + стартиране (3-5 минути)..."
docker compose up -d --build

echo "→ Изчакване услугите да стартират..."
sleep 15

# ── 11. DB migrations ────────────────────────────────────────────────────
echo "→ Миграции на базата данни..."
docker compose exec -T server npx prisma db push --accept-data-loss 2>/dev/null || \
docker compose exec -T server npx prisma migrate deploy 2>/dev/null || true

sleep 5

# ── 12. Health check ─────────────────────────────────────────────────────
echo "→ Проверка..."
API=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/health 2>/dev/null)
CLIENT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null)
OPERATOR=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:443/ 2>/dev/null)

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           ИНСТАЛАЦИЯТА ЗАВЪРШИ УСПЕШНО              ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║                                                      ║"
printf "║  Чат страница:  http://%-29s║\n" "${SERVER_IP}"
printf "║  Оператори:     http://%-29s║\n" "${SERVER_IP}:443"
echo "║                                                      ║"
echo "║  API статус:     HTTP ${API}                               ║"
echo "║  Client статус:  HTTP ${CLIENT}                               ║"
echo "║                                                      ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Запази JWT_SECRET:                                  ║"
echo "║  ${JWT_SECRET}  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Следваща стъпка → Виж INSTALL.md стъпка 5 за оператор акаунт"
echo ""
