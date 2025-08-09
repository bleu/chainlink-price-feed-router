# Chainlink Registry

A comprehensive dual-process indexing system for Chainlink data feeds and price aggregators across multiple chains.

## 🏗️ Architecture

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

This monorepo contains three main applications:

### 🏁 **Flags Indexer** (`apps/chainlink-flags-indexer/`)
Lightweight indexer that processes only Chainlink flag events to discover aggregators.

**Key Features:**
- **Flags-only indexing** - Processes FlagRaised/FlagLowered events
- **Aggregator discovery** - Finds aggregator addresses from flag events  
- **Lightweight & fast** - Minimal resource usage for quick discovery
- **Always running** - Provides continuous discovery of new aggregators

### 📊 **Aggregators Indexer** (`apps/chainlink-aggregators-indexer/`)
Full-featured indexer that processes both flag events and aggregator price events.

**Key Features:**
- **Complete dataset** - Indexes both flags and aggregator events
- **Price tracking** - Tracks AnswerUpdated and NewRound events
- **Dynamic config** - Aggregator addresses added dynamically by supervisor
- **Price quote API** - REST endpoints with BFS pathfinding for cross-token pricing

### 🎛️ **Supervisor** (`apps/chainlink-supervisor/`)
Orchestrates both indexers and manages the discovery process.

**Key Features:**
- **Process management** - Starts, stops, and monitors both indexers
- **Discovery polling** - Polls flags database for new aggregators
- **Config updates** - Updates aggregator indexer config dynamically
- **Health monitoring** - Automatic restart and fault tolerance

### 🛠️ **SDK** (`pkg/sdk/`)
A TypeScript SDK that provides a clean, type-safe interface for consuming the price API.

**Key Features:**
- **Type-safe** - Full TypeScript support with comprehensive types
- **Modern API** - Promise-based with async/await support
- **Batch operations** - Fetch multiple quotes in parallel
- **Error handling** - Specific error classes for different failure scenarios

## 🚀 Quick Start

### Option 1: Supervisor Mode (Recommended)

```bash
# Install dependencies
pnpm install

# Set up environment files
cp apps/chainlink-flags-indexer/.envrc.template apps/chainlink-flags-indexer/.envrc
cp apps/chainlink-aggregators-indexer/.envrc.template apps/chainlink-aggregators-indexer/.envrc  
cp apps/chainlink-supervisor/.envrc.template apps/chainlink-supervisor/.envrc

# Edit .envrc files with your database URL and DRPC API key

# Start the supervisor (manages everything)
cd apps/chainlink-supervisor
pnpm start
```

### Option 2: Manual Mode

```bash
# Terminal 1: Flags indexer
cd apps/chainlink-flags-indexer && pnpm dev

# Terminal 2: Aggregators indexer
cd apps/chainlink-aggregators-indexer && pnpm dev

# Terminal 3: Supervisor  
cd apps/chainlink-supervisor && pnpm dev
```

**APIs will be available at:**
- Flags Indexer: `http://localhost:42069`
- Aggregators Indexer: `http://localhost:42070`

### Using the SDK

```bash
cd pkg/sdk
pnpm install
pnpm build
```

```typescript
import { ChainlinkRegistryClient } from '@chainlink-registry/sdk';

const client = new ChainlinkRegistryClient({
  baseUrl: 'http://localhost:42069'
});

// Get a price quote
const quote = await client.getPriceQuote(8453, 'ETH', 'USD');
console.log(`1 ETH = ${quote.formattedPrice} USD`);

// Get available tokens
const tokens = await client.getAvailableTokens(8453);
console.log(`Available tokens: ${tokens.tokens.join(', ')}`);
```

## 🌐 Supported Networks

| Chain ID | Network | Status |
|----------|---------|--------|
| 1 | Ethereum | ✅ Active |
| 10 | Optimism | ✅ Active |
| 100 | Gnosis | ✅ Active |
| 130 | Unichain | ✅ Active |
| 137 | Polygon | ✅ Active |
| 146 | Sonic | ✅ Active |
| 324 | zkSync Era | ✅ Active |
| 1868 | Soneium | ✅ Active |
| 5000 | Mantle | ✅ Active |
| 8453 | Base | ✅ Active |
| 42161 | Arbitrum One | ✅ Active |
| 42220 | Celo | ✅ Active |
| 43114 | Avalanche | ✅ Active |
| 57073 | Ink | ✅ Active |
| 59144 | Linea | ✅ Active |
| 60808 | BOB | ✅ Active |
| 534352 | Scroll | ✅ Active |

## 📖 Examples

### Basic Price Query
```bash
curl "http://localhost:42069/price/quote/8453/ETH/USD"
```

### Multi-hop Pricing
```bash
curl "http://localhost:42069/price/quote/1/BTC/EUR"
```

## 🚧 Development

### Prerequisites
- Node.js 18+
- pnpm
- PostgreSQL (handled by Ponder)
- DRPC API key

### Project Structure
```
chainlink-registry/
├── apps/
│   └── chainlink-registry-indexer/    # Ponder indexer application
│       ├── src/
│       │   ├── index.ts              # Main indexer logic
│       │   ├── api/                  # REST API endpoints
│       │   └── utils/                # Utilities for data fetching
│       ├── abis/                     # Contract ABIs
│       ├── ponder.config.ts          # Multi-chain configuration
│       └── ponder.schema.ts          # Database schema
├── pkg/
│   └── sdk/                          # TypeScript SDK
│       ├── src/
│       │   ├── client.ts             # Main client class
│       │   ├── types.ts              # TypeScript definitions
│       │   └── utils.ts              # Helper functions
│       └── examples/                 # Usage examples
└── package.json                      # Workspace configuration
```

## 📄 License

MIT

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 🔗 Links

- [Ponder Documentation](https://ponder.sh)
- [Chainlink Price Feeds](https://docs.chain.link/data-feeds/price-feeds)
- [DRPC](https://drpc.org) - Multi-chain RPC provider