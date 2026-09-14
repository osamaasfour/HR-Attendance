FROM node:20-alpine

RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

RUN mkdir -p /data/hr-documents && chown -R app:app /app /data/hr-documents
USER app

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3002/health || exit 1

CMD ["node", "src/server.js"]
