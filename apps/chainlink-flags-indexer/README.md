# Chainlink Flags Indexer

Lightweight indexer that processes only Chainlink flag events to discover aggregators.

## Purpose

- **Discover Aggregators**: Index flag events to find aggregator addresses
- **Lightweight**: Only processes flag events, not price data
- **Always Running**: Provides continuous discovery of new aggregators

## Database Schema

- `flag_raised` - FlagRaised events
- `flag_lowered` - FlagLowered events  
- `data_feed` - Discovered data feeds with metadata
- `token` - Token information for price feeds
- `data_feed_token` - Relationships between feeds and tokens

## Usage

```bash
# Development
pnpm dev

# Production
pnpm start

# API only
pnpm serve
```

## API Endpoints

- `http://localhost:42069/status` - Indexing status
- `http://localhost:42069/ready` - Health check
- `http://localhost:42069/sql` - SQL query interface
- `http://localhost:42069/graphql` - GraphQL API

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `DATABASE_SCHEMA` - Database schema name (default: chainlink_registry_flags)
- `DRPC_API_KEY` - DRPC API key for RPC access
- `PONDER_PORT` - API server port (default: 42069)