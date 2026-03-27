# Note: This Dockerfile must be built from the monorepo root with:
# docker build -t chainlink-supervisor -f apps/chainlink-supervisor/Dockerfile .

FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install -g pnpm@10.8.0

WORKDIR /usr/src/app

# Install dependencies
FROM base AS build

RUN apt-get update && apt-get install -y python3 build-essential

COPY patches ./patches/
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/chainlink-supervisor/package.json ./apps/chainlink-supervisor/
COPY apps/chainlink-aggregators-indexer/package.json ./apps/chainlink-aggregators-indexer/
COPY apps/chainlink-flags-indexer/package.json ./apps/chainlink-flags-indexer/

RUN pnpm install --frozen-lockfile

COPY apps/chainlink-supervisor ./apps/chainlink-supervisor/
COPY apps/chainlink-aggregators-indexer ./apps/chainlink-aggregators-indexer/
COPY apps/chainlink-flags-indexer ./apps/chainlink-flags-indexer/

COPY apps/dev-deployment/envrc-templates/ ./apps/dev-deployment/envrc-templates/
COPY apps/chainlink-supervisor/docker-run.sh ./apps/chainlink-supervisor/docker-run.sh

# Production image
FROM base

ENV NODE_ENV=production
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl gettext-base && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /pnpm /pnpm
COPY --from=build --chown=node:node /usr/src/app /usr/src/app
RUN chmod +x /usr/src/app/apps/chainlink-supervisor/docker-run.sh

USER node

WORKDIR /usr/src/app
CMD ["/usr/src/app/apps/chainlink-supervisor/docker-run.sh"]