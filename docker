FROM node:20-bookworm

# Install Python
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first
COPY package*.json ./

# Install Node dependencies
RUN npm ci --omit=dev

# Copy application
COPY . .

# Python dependencies
RUN python3 -m pip install --break-system-packages openpyxl

# Northflank application port
EXPOSE 3000

# Start Node application
CMD ["npm", "start"]
