# Chainlink Aggregators Indexer

Full-featured indexer that processes both flag events and aggregator price events.

## Purpose

- **Complete Dataset**: Index both flags and aggregator events
- **Price Data**: Track price updates and rounds from aggregators
- **Dynamic Config**: Aggregator addresses are added dynamically by the supervisor

## Database Schema

Includes all tables from flags indexer plus:

- `price_update` - AnswerUpdated events from aggregators
- `new_round` - NewRound events from aggregators

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

- `http://localhost:42070/status` - Indexing status
- `http://localhost:42070/ready` - Health check
- `http://localhost:42070/sql` - SQL query interface
- `http://localhost:42070/graphql` - GraphQL API

## Configuration

The `ponder.config.ts` file contains:

1. **Flags Contract**: Same as flags indexer
2. **Aggregator Contracts**: Initially empty, populated by supervisor

The supervisor updates the aggregator section when new aggregators are discovered:

```typescript
AccessControlledOffchainAggregator: {
  abi: AccessControlledOffchainAggregatorAbi,
  chain: {
    ethereum: {
      address: ["0x...", "0x..."], // Added dynamically
      startBlock: 22031347,
    },
    // ... other chains
  },
}
```

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `DATABASE_SCHEMA` - Database schema name (default: chainlink_registry_aggregators)
- `DRPC_API_KEY` - DRPC API key for RPC access
- `PONDER_PORT` - API server port (default: 42070)