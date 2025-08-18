#!/bin/bash

set -euxo pipefail

if [ -z "$DRPC_API_KEY" ]; then
  echo "Error: DRPC_API_KEY is not set."
  exit 1
fi
if [ -z "$POSTGRES_USER" ]; then
  echo "Error: POSTGRES_USER is not set."
  exit 1
fi
if [ -z "$POSTGRES_PASSWORD" ]; then
  echo "Error: POSTGRES_PASSWORD is not set."
  exit 1
fi
if [ -z "$POSTGRES_DB" ]; then
  echo "Error: POSTGRES_DB is not set."
  exit 1
fi

export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}"
export DRPC_API_KEY

envsubst \
    < apps/dev-deployment/envrc-templates/chainlink-aggregators-indexer.envrc.template \
    > apps/chainlink-aggregators-indexer/.envrc
envsubst \
    < apps/dev-deployment/envrc-templates/chainlink-flags-indexer.envrc.template \
    > apps/chainlink-flags-indexer/.envrc
envsubst \
    < apps/dev-deployment/envrc-templates/chainlink-supervisor.envrc.template \
    > apps/chainlink-supervisor/.envrc

cd apps/chainlink-supervisor
exec pnpm start