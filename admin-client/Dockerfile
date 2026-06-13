# Build context: repo root
FROM node:22-alpine AS build
WORKDIR /app

# Install dependencies — separate layer for caching
COPY admin-client/package*.json ./
RUN npm ci --legacy-peer-deps

# Build
COPY admin-client/ ./
RUN npm run build

# Runtime — serve with nginx
FROM nginx:alpine AS runtime

COPY --from=build /app/dist/ghost-list-admin-client/browser /usr/share/nginx/html
COPY admin-client/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
