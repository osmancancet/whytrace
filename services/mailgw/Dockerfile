FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --silent
COPY src ./src
ENV MAILGW_PORT=8090
EXPOSE 8090
CMD ["npx", "--yes", "tsx@4.19.2", "src/server.ts"]
