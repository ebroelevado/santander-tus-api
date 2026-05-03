# ─── Build Stage ────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY data/ ./data/
RUN npm run build

# ─── Production Stage ────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/data ./data
COPY package*.json ./

EXPOSE 3001
ENV PORT=3001
CMD ["node", "dist/index.js"]
