# Citadel Ops — full-stack image (HQ + Nitro API + MCP). Keeps deps so the entrypoint
# can run migrations (drizzle-kit) and the seed (tsx) before serving.
FROM node:22-alpine

WORKDIR /app

# Install dependencies (cached unless the manifests change).
COPY package.json package-lock.json ./
RUN npm ci

# Build the Nuxt app (produces .output). Needs network for @nuxt/fonts.
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
