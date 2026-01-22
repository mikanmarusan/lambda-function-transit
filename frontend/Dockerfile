# Development stage
FROM node:22-slim AS development

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Source code is provided via volume mount for HMR
# CMD is specified in docker-compose

# Production build stage (for CI)
FROM node:22-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Output: /app/dist (to be synced to S3)
