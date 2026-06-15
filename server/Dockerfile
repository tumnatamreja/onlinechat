FROM node:20-slim AS base
WORKDIR /app

RUN apt-get update -qq && apt-get install -y -qq openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push --accept-data-loss 2>/dev/null || true && node dist/index.js"]
