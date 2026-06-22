FROM node:22-slim

WORKDIR /app

# Install dependencies first for better caching
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Build TypeScript code
RUN npm run build

# Create necessary directories for volumes
RUN mkdir -p /app/data /app/uploads

# Expose port
EXPOSE 4000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Start server
CMD ["npm", "start"]
