FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline

COPY . .
RUN npm run build

FROM caddy:2-alpine

COPY --from=builder /app/dist/dfs-ui/browser /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80 443
