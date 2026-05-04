FROM node:22-bullseye-slim

# Install system dependencies for Mediasoup (Python, Build Tools, GCC)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    gcc \
    g++ \
    make \
    net-tools \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for layer caching
COPY package*.json ./

# Install dependencies (includes mediasoup native build)
RUN npm ci --omit=dev

# Copy server source code
COPY . .

# ─── Environment Defaults (Override via docker-compose / Oracle .env) ───
ENV NODE_ENV=production
ENV PORT=3001
ENV LISTEN_IP=0.0.0.0
# ANNOUNCED_IP is set at runtime via docker-compose.yml / environment variable
# so DO NOT hardcode it here

# ─── Port Exposures ───
# API + Socket.IO port
EXPOSE 3001

# Mediasoup RTP/RTCP UDP+TCP port range (matches worker config)
EXPOSE 40000-40999/udp
EXPOSE 40000-40999/tcp

# Start Server
CMD ["node", "index.js"]
