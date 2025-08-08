# Chainlink Registry Supervisor

The supervisor is an intelligent orchestration system that manages the dynamic discovery and indexing of Chainlink aggregator contracts. It solves the problem of indexing aggregator events when you only know the aggregator addresses after the flags indexing is complete.

## 🎯 Problem Solved

Chainlink aggregators don't emit deployment events that reference their addresses, so we can't use Ponder's factory pattern. Instead, we need to:

1. **First**: Index the Flags contracts to discover which aggregators exist
2. **Then**: Dynamically update the ponder config to include those aggregators
3. **Finally**: Restart ponder to begin indexing aggregator events (`AnswerUpdated`, `NewRound`)

## 🏗️ Architecture

The supervisor orchestrates this process through 4 phases:

### Phase 1: Initial Flags Indexing
- Starts ponder with the original config (flags contracts only)
- Monitors indexing progress via `/status` and `/ready` endpoints

### Phase 2: Aggregator Discovery
- Waits for chains to complete initial indexing
- Queries the database to discover aggregator addresses from flags data
- Groups aggregators by chain for config generation

### Phase 3: Config Regeneration & Restart
- Generates new ponder config with aggregator contracts
- Backs up original config and validates new config
- Stops ponder processes and activates new config
- Restarts ponder with aggregator indexing enabled

### Phase 4: Monitoring & Health Checks
- Monitors process health and restarts if needed
- Periodic discovery of new aggregators
- Status reporting and logging

## 🚀 Usage

### Basic Usage

```bash
# Install dependencies
pnpm install

# Start the supervisor
pnpm supervisor

# Or in development mode with auto-restart
pnpm supervisor:dev
```

### Environment Variables

```bash
# Ponder API URL (default: http://localhost:42069)
PONDER_API_URL=http://localhost:42069

# Check interval in milliseconds (default: 30000)
CHECK_INTERVAL=30000

# Restart delay in milliseconds (default: 5000)
RESTART_DELAY=5000

# Maximum restart attempts (default: 3)
MAX_RETRIES=3

# Database connection string (optional)
DATABASE_URL=postgresql://...
```

### Manual Control

```bash
# Start just the indexer
pnpm start

# Start just the API server
pnpm serve

# Check indexing status
curl http://localhost:42069/status

# Check if indexing is complete
curl http://localhost:42069/ready
```

## 📊 Components

### PonderMonitor (`ponder-monitor.ts`)
- Monitors ponder indexing status via HTTP endpoints
- Tracks which chains are ready for aggregator discovery
- Provides health checks and readiness detection

### AggregatorDiscovery (`aggregator-discovery.ts`)
- Discovers aggregator addresses from the flags database
- Groups aggregators by chain and maintains discovery state
- Provides statistics and filtering capabilities

### ConfigGenerator (`config-generator.ts`)
- Generates new ponder configs with aggregator contracts
- Handles config validation and backup/restore
- Creates chain-specific aggregator contract definitions

### ProcessManager (`process-manager.ts`)
- Manages ponder indexer and server processes
- Handles graceful shutdown and restart logic
- Monitors process health and automatic recovery

### Main Supervisor (`index.ts`)
- Orchestrates the entire discovery and restart process
- Coordinates between all components
- Provides CLI interface and error handling

## 🔧 Generated Config Structure

The supervisor generates configs like this:

```typescript
export default createConfig({
  chains: { /* original chains */ },
  contracts: {
    // Original flags contracts
    ChainLinkDataFeedFlags: { /* ... */ },
    
    // Generated aggregator contracts
    ethereumAggregators: {
      abi: AccessControlledOffchainAggregatorAbi,
      chain: "ethereum",
      address: [
        "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", // ETH/USD
        "0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c", // BTC/USD
        // ... more aggregators
      ],
      startBlock: 10000000,
    },
    baseAggregators: {
      abi: AccessControlledOffchainAggregatorAbi,
      chain: "base",
      address: [
        // Base aggregators...
      ],
      startBlock: 1000000,
    },
    // ... more chains
  },
});
```

## 📈 Monitoring

The supervisor provides comprehensive monitoring:

### Status Logs
```
📊 Status Report:
  Indexer: ✅ (uptime: 1234s, restarts: 0)
  Server: ✅ (uptime: 1234s, restarts: 0)
  Aggregators: 156 total across 12 chains
```

### Discovery Progress
```
🔍 Discovering aggregators from database...
📊 Found 45 active data feeds
✅ Discovered 45 aggregators across 8 chains
  ethereum: 15 aggregators
  base: 8 aggregators
  arbitrum: 12 aggregators
  ...
```

### Config Generation
```
🔧 Generating ponder config with 45 aggregators...
✅ Generated config written to: ponder.config.ts
📊 Config includes:
  ethereum: 15 aggregators
  base: 8 aggregators
  arbitrum: 12 aggregators
```

## 🛡️ Error Handling

The supervisor includes robust error handling:

- **Process crashes**: Automatic restart with exponential backoff
- **Config validation**: Syntax and structure validation before activation
- **Database errors**: Graceful degradation and retry logic
- **Network issues**: Timeout handling and connection recovery
- **Graceful shutdown**: Proper cleanup on SIGINT/SIGTERM

## 🔄 Recovery Scenarios

### Failed Config Generation
- Automatically rolls back to original config
- Continues with flags-only indexing
- Logs detailed error information

### Process Restart Failures
- Attempts restart up to `MAX_RETRIES` times
- Falls back to manual intervention if all retries fail
- Maintains process state and restart counters

### Database Connection Issues
- Continues with cached aggregator data
- Retries discovery on next cycle
- Logs connection status and errors

## 📁 File Structure

```
supervisor/
├── index.ts                 # Main supervisor orchestrator
├── ponder-monitor.ts        # Ponder status monitoring
├── aggregator-discovery.ts  # Aggregator discovery from DB
├── config-generator.ts      # Dynamic config generation
├── process-manager.ts       # Process lifecycle management
├── types.ts                 # TypeScript type definitions
└── README.md               # This file
```

## 🚧 Future Enhancements

- **Hot config reload**: Update config without full restart
- **Web dashboard**: Real-time monitoring interface
- **Metrics export**: Prometheus/Grafana integration
- **Alert system**: Notifications for failures
- **Multi-instance**: Horizontal scaling support

## 🐛 Troubleshooting

### Supervisor won't start
```bash
# Check if ponder is already running
ps aux | grep ponder

# Check if ports are available
lsof -i :42069

# Check environment variables
env | grep PONDER
```

### Config generation fails
```bash
# Check file permissions
ls -la ponder.config.*

# Validate original config syntax
pnpm codegen

# Check database connection
pnpm db list
```

### Processes keep restarting
```bash
# Check logs for errors
tail -f supervisor.log

# Check system resources
top
df -h

# Check database connectivity
psql $DATABASE_URL -c "SELECT 1"
```

This supervisor system enables fully automated discovery and indexing of Chainlink aggregator events, solving the factory pattern limitation while providing robust monitoring and error recovery.