#!/bin/bash

set -euxo pipefail

if [ -z "$DRPC_API_KEY" ]; then
  echo "Error: DRPC_API_KEY is not set."
  exit 1
fi
if [ -z "$DATABASE_PASSWORD" ]; then
  echo "Error: DATABASE_PASSWORD is not set."
  exit 1
fi

export DATABASE_URL="postgresql://bleu:${DATABASE_PASSWORD}@postgres:5432/bleu"
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