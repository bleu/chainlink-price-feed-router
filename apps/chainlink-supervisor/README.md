# Chainlink Registry Supervisor

The supervisor orchestrates the dual-process architecture for Chainlink registry indexing.

## Architecture

```
┌─────────────────────┐    ┌─────────────────────────┐
│  Flags Indexer      │    │  Aggregators Indexer    │
│  (Port 42069)       │    │  (Port 42070)           │
│                     │    │                         │
│ - Index flags only  │    │ - Index flags + aggs    │
│ - Discover aggs     │    │ - Complete dataset      │
│ - Lightweight       │    │ - Updated dynamically   │
└─────────────────────┘    └─────────────────────────┘
         │                           ▲
         │ Discovers new aggregators │
         └───────────────────────────┘
                    │
         ┌─────────────────────┐
         │    Supervisor       │
         │                     │
         │ - Polls flags DB    │
         │ - Updates agg config│
         │ - Manages processes │
         └─────────────────────┘
```

## Usage

```bash
# Start the supervisor
cd apps/chainlink-supervisor
pnpm start

# Development mode with auto-restart
pnpm dev
```

## Environment Variables

- `FLAGS_API_URL` - Flags indexer API URL (default: http://localhost:42069)
- `AGGREGATORS_API_URL` - Aggregators indexer API URL (default: http://localhost:42070)
- `MAX_RETRIES` - Maximum restart attempts (default: 3)
- `DATABASE_URL` - PostgreSQL connection string
- `DRPC_API_KEY` - DRPC API key for RPC access

**Note**: The supervisor uses fixed ports (42069 for flags, 42070 for aggregators) and polls for new aggregators every 10 minutes.

## How It Works

1. **Starts Flags Indexer**: Lightweight process that only indexes flag events on port 42069
2. **Waits for Complete Sync**: Uses `/ready` endpoint to ensure flags indexer has finished historical sync
3. **Discovers Aggregators**: Queries flags database to find all aggregator addresses
4. **Starts Aggregators Indexer**: Full process that indexes both flags and aggregators on port 42070
5. **Ongoing Discovery**: Polls flags database every 10 minutes for new aggregators
6. **Dynamic Updates**: When ≥3 new aggregators are found, updates config and restarts aggregators indexer
7. **Health Monitoring**: Monitors both processes and restarts them if they fail

## Benefits

- ✅ **No downtime during discovery** - Flags indexer keeps running
- ✅ **Real-time aggregator addition** - New aggregators are added as soon as flags are indexed
- ✅ **Fault tolerance** - Each process can fail independently
- ✅ **Clean separation** - Discovery vs full indexing are separate concerns
- ✅ **Scalable** - Can run indexers on different machines if needed
- ✅ **Proper dependency ordering** - Aggregators only start after flags indexer is completely ready
- ✅ **Consistent ports** - Fixed port allocation prevents conflicts in dev mode