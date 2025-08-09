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
- `CHECK_INTERVAL` - Discovery polling interval in ms (default: 30000)
- `RESTART_DELAY` - Delay before restarting processes in ms (default: 5000)
- `MAX_RETRIES` - Maximum restart attempts (default: 3)
- `DATABASE_URL` - PostgreSQL connection string
- `DRPC_API_KEY` - DRPC API key for RPC access

## How It Works

1. **Starts Flags Indexer**: Lightweight process that only indexes flag events
2. **Starts Aggregators Indexer**: Full process that indexes both flags and aggregators (starts with empty aggregator config)
3. **Polls for Discovery**: Regularly checks flags database for new aggregators
4. **Updates Config**: When new aggregators are found, updates the aggregators indexer config and restarts it
5. **Health Monitoring**: Monitors both processes and restarts them if they fail

## Benefits

- ✅ **No downtime during discovery** - Flags indexer keeps running
- ✅ **Real-time aggregator addition** - New aggregators are added as soon as flags are indexed
- ✅ **Fault tolerance** - Each process can fail independently
- ✅ **Clean separation** - Discovery vs full indexing are separate concerns
- ✅ **Scalable** - Can run indexers on different machines if needed