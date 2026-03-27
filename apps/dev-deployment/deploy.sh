export COMPOSE_PROJECT_NAME=chainlink-dev-deployment
docker compose up -d --build --remove-orphans ${COMPOSE_UP_ARGS:-}
docker compose logs -f --no-log-prefix chainlink-supervisor