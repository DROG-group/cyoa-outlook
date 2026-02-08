FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npx tsc

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist/ dist/
COPY src/cards/card-template.json dist/cards/card-template.json
COPY src/data/story-graph.json dist/data/story-graph.json
EXPOSE 3000
CMD ["node", "dist/index.js"]
