# WhyTrace demo image.
# Builds the Fastify API + the Vite analyst console. Defaults to SAMPLE_MODE=true
# so a judge can boot the image with no keys and no network:
#   docker build -t whytrace .
#   docker run -p 8000:8000 whytrace
# To exercise the live pipeline instead, mount a .env with your Zetaris + Nightshift
# credentials and set SAMPLE_MODE=false on the run command.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY apps/ ./apps/
COPY packages/ ./packages/
COPY services/ ./services/
COPY scripts/ ./scripts/
COPY vitest.config.ts ./
RUN npm install --no-audit --no-fund --silent
RUN npm run build:web

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV SAMPLE_MODE=true
ENV PORT=8000
# Copy only what the API + CLI need at runtime.
COPY --from=build /app /app
# Create the empty logs/samples/output dirs the API writes to.
RUN mkdir -p logs output_examples samples
EXPOSE 8000
# tsx can execute TypeScript directly in production for this demo. The command
# starts the API server; judges can hit http://localhost:8000/healthz to confirm.
CMD ["npx", "tsx", "apps/api/src/server.ts"]
