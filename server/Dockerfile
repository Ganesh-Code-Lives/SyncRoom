FROM node:18-bullseye-slim

# Install system dependencies for Mediasoup (Python, Build Tools)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    net-tools \
    iproute2 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy server source code
COPY . .

# Environment Defaults (Override in Deployment Provider)
ENV NODE_ENV=production
ENV PORT=3001
ENV LISTEN_IP=0.0.0.0
ENV ANNOUNCED_IP=public

# Expose API/Socket Port
EXPOSE 3001

# Expose Mediasoup UDP/TCP Ports (Range must match server config)
# Standard WebRTC Range
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

# Start Server
CMD ["npm", "start"]
