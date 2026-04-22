# ─────────────────────────────────────────
# Stage 1: Builder
# Node.js to build the React app
# ─────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Copy dependency files first for layer caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ─────────────────────────────────────────
# Stage 2: Runtime
# Nginx to serve the static build output
# Final image is ~25MB
# ─────────────────────────────────────────
FROM nginx:alpine AS runtime

# Copy built React app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config for React Router
# Without this, refreshing any page other than / returns 404
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
