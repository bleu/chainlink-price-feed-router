#!/bin/bash

DUMP_PATH=$1
if [ -z "$DUMP_PATH" ]; then
  echo "Usage: $0 <dump_path>"
  exit 1
fi

if [ ! -f "$DUMP_PATH" ]; then
  echo "Dump file not found: $DUMP_PATH"
  exit 1
fi

echo "Loading dump from $DUMP_PATH..."
pv "$DUMP_PATH" | \
    docker compose exec -T postgres pg_restore \
        --format=c \
        --clean \
        --if-exists \
        -d chainlink \
        -U postgres
