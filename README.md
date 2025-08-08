# Chainlink Registry

A comprehensive monorepo for indexing and accessing Chainlink price feeds across multiple blockchain networks.

## 🏗️ Architecture

This monorepo contains two main components:

### 📊 **Indexer** (`apps/chainlink-registry-indexer/`)
A [Ponder](https://ponder.sh) application that discovers and indexes official Chainlink price feeds across 17+ blockchain networks.

**Key Features:**
- **Multi-chain indexing** - Tracks price feeds across Ethereum, Base, Arbitrum, Polygon, and 13+ other chains
- **Official feed discovery** - Only indexes feeds verified by Chainlink's Flags Contract Registry
- **Real-time monitoring** - Processes `FlagRaised`/`FlagLowered` events to track feed status
- **Price calculation API** - REST endpoints with BFS pathfinding for cross-token pricing
- **Robust error handling** - Gracefully handles stale feeds and RPC failures

**API Endpoints:**
- `GET /price/quote/:chainId/:fromToken/:toToken` - Get price quote between tokens
- `GET /price/tokens/:chainId` - List available tokens for a chain
- `GET /price/health` - API health check
- `GET /graphql` - GraphQL endpoint for raw data access

### 🛠️ **SDK** (`pkg/sdk/`)
A TypeScript SDK that provides a clean, type-safe interface for consuming the price API.

**Key Features:**
- **Type-safe** - Full TypeScript support with comprehensive types
- **Modern API** - Promise-based with async/await support
- **Batch operations** - Fetch multiple quotes in parallel
- **Error handling** - Specific error classes for different failure scenarios
- **Utilities** - Helper functions for price formatting and route analysis
- **Examples** - Ready-to-use examples including portfolio tracking

## 🚀 Quick Start

### Running the Indexer

```bash
cd apps/chainlink-registry-indexer
cp .envrc.template .envrc
# Add your DRPC_API_KEY to .envrc
pnpm install
pnpm dev
```

The API will be available at `http://localhost:42069`

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