# ── Stage 1: dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy manifests only — Docker layer cache
COPY package.json package-lock.json ./

RUN npm ci --omit=dev

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Copy production node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source and Prisma schema
COPY prisma ./prisma
COPY src    ./src
COPY package.json ./

# Generate the Prisma Client inside the image
RUN npx prisma generate

EXPOSE 3000

# Run migrations then start the server.
# In a real deployment, migrations would be a separate CI step.
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
