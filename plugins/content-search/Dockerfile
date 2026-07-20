FROM node:24-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV CONTENT_DIR=/data
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server/package.json ./
ENTRYPOINT ["node", "dist/index.js"]
