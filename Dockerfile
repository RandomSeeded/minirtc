FROM node:20-alpine

WORKDIR /app

# Install server deps
COPY package*.json ./
RUN npm ci

# Install client deps
COPY client/package*.json ./client/
RUN npm ci --prefix client

# Copy source and build
COPY . .
RUN npm run build --prefix client
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "start"]
