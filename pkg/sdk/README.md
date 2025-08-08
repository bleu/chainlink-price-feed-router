# @chainlink-registry/sdk

TypeScript SDK for the Chainlink Registry Price API. This SDK provides a clean, type-safe interface for fetching Chainlink price data across multiple blockchain networks.

## Features

- 🔗 **Multi-chain support** - Works across 13+ blockchain networks
- 🛡️ **Type-safe** - Full TypeScript support with comprehensive types
- 🚀 **Modern API** - Promise-based with async/await support
- 🔄 **Route finding** - Automatic price route discovery with BFS pathfinding
- ⚡ **Batch operations** - Fetch multiple quotes in parallel
- 🛠️ **Error handling** - Comprehensive error types and validation
- 📊 **Utilities** - Helper functions for price formatting and analysis

## Installation

```bash
npm install @chainlink-registry/sdk
# or
yarn add @chainlink-registry/sdk
# or
pnpm add @chainlink-registry/sdk
```

## Quick Start

```typescript
import { ChainlinkRegistryClient } from '@chainlink-registry/sdk';

// Initialize the client
const client = new ChainlinkRegistryClient({
  baseUrl: 'https://your-api-url.com'
});

// Get a price quote
const quote = await client.getPriceQuote(1, 'BTC', 'USD');
console.log(`1 BTC = ${quote.formattedPrice} USD`);

// Get available tokens for a chain
const tokens = await client.getAvailableTokens(1);
console.log('Available tokens:', tokens.tokens);
```

## API Reference

### ChainlinkRegistryClient

#### Constructor

```typescript
new ChainlinkRegistryClient(config: ClientConfig)
```

**ClientConfig:**
- `baseUrl: string` - Base URL of the Chainlink Registry API
- `timeout?: number` - Request timeout in milliseconds (default: 10000)
- `headers?: Record<string, string>` - Custom headers to include with requests

#### Methods

##### getPriceQuote()

Get a price quote between two tokens.

```typescript
async getPriceQuote(
  chainId: ChainId,
  fromToken: string,
  toToken: string,
  options?: PriceQuoteOptions
): Promise<PriceQuote>
```

**Example:**
```typescript
const quote = await client.getPriceQuote(1, 'BTC', 'USD', {
  maxHops: 3,
  decimals: 18
});

console.log(`Price: ${quote.formattedPrice}`);
console.log(`Route: ${quote.route.path.join(' → ')}`);
console.log(`Hops: ${quote.route.hops}`);
```

##### getAvailableTokens()

Get all available tokens for a specific chain.

```typescript
async getAvailableTokens(chainId: ChainId): Promise<TokensResponse>
```

**Example:**
```typescript
const tokens = await client.getAvailableTokens(1);
console.log(`Found ${tokens.count} tokens:`, tokens.tokens);
```

##### getBatchPriceQuotes()

Get multiple price quotes in parallel.

```typescript
async getBatchPriceQuotes(
  requests: Array<{
    chainId: ChainId;
    fromToken: string;
    toToken: string;
    options?: PriceQuoteOptions;
  }>
): Promise<Array<PriceQuote | Error>>
```

**Example:**
```typescript
const quotes = await client.getBatchPriceQuotes([
  { chainId: 1, fromToken: 'BTC', toToken: 'USD' },
  { chainId: 1, fromToken: 'ETH', toToken: 'USD' },
  { chainId: 137, fromToken: 'MATIC', toToken: 'USD' },
]);

quotes.forEach((result, index) => {
  if (result instanceof Error) {
    console.error(`Quote ${index} failed:`, result.message);
  } else {
    console.log(`${result.fromToken}/${result.toToken}: ${result.formattedPrice}`);
  }
});
```

##### hasRoute()

Check if a price route exists between two tokens.

```typescript
async hasRoute(
  chainId: ChainId,
  fromToken: string,
  toToken: string,
  maxHops?: number
): Promise<boolean>
```

**Example:**
```typescript
const routeExists = await client.hasRoute(1, 'BTC', 'EUR');
console.log(`BTC → EUR route available: ${routeExists}`);
```

##### getHealth()

Check the API health status.

```typescript
async getHealth(): Promise<HealthResponse>
```

## Supported Chains

| Chain ID | Network | Symbol |
|----------|---------|--------|
| 1 | Ethereum | ETH |
| 10 | Optimism | ETH |
| 100 | Gnosis | xDAI |
| 130 | Unichain | ETH |
| 137 | Polygon | MATIC |
| 146 | Sonic | S |
| 324 | zkSync Era | ETH |
| 1868 | Soneium | ETH |
| 5000 | Mantle | MNT |
| 8453 | Base | ETH |
| 42161 | Arbitrum One | ETH |
| 42220 | Celo | CELO |
| 43114 | Avalanche | AVAX |
| 57073 | Ink | ETH |
| 59144 | Linea | ETH |
| 60808 | BOB | ETH |
| 534352 | Scroll | ETH |

## Error Handling

The SDK provides specific error types for different failure scenarios:

```typescript
import {
  ChainlinkRegistryError,
  NetworkError,
  ApiResponseError,
  ValidationError,
  RouteNotFoundError,
  UnsupportedChainError,
} from '@chainlink-registry/sdk';

try {
  const quote = await client.getPriceQuote(1, 'BTC', 'INVALID_TOKEN');
} catch (error) {
  if (error instanceof RouteNotFoundError) {
    console.log('No price route found between these tokens');
  } else if (error instanceof ValidationError) {
    console.log('Invalid input parameters');
  } else if (error instanceof NetworkError) {
    console.log('Network or timeout error');
  } else if (error instanceof UnsupportedChainError) {
    console.log('Chain not supported');
  }
}
```

## Utilities

The SDK includes helpful utility functions:

```typescript
import {
  formatPrice,
  parsePrice,
  getPriceAge,
  isPriceStale,
  describeRoute,
  calculateRouteComplexity,
  isSupportedChain,
  getChainInfo,
} from '@chainlink-registry/sdk';

// Format raw price
const formatted = formatPrice('1500000000000000000000', 18); // "1500"

// Check if chain is supported
if (isSupportedChain(1)) {
  const chainInfo = getChainInfo(1); // { name: 'Ethereum', symbol: 'ETH' }
}

// Analyze a price quote
const quote = await client.getPriceQuote(1, 'BTC', 'EUR');
const description = describeRoute(quote); // "BTC → USD → EUR (2 hops)"
const complexity = calculateRouteComplexity(quote);
const isStale = isPriceStale(quote.updatedAt, 3600); // Check if older than 1 hour
```

## Advanced Examples

### Portfolio Pricing

```typescript
async function getPortfolioPrices(holdings: Array<{ token: string; amount: string }>) {
  const client = new ChainlinkRegistryClient({ baseUrl: 'https://api.example.com' });
  
  const requests = holdings.map(({ token }) => ({
    chainId: 1 as const,
    fromToken: token,
    toToken: 'USD',
  }));
  
  const quotes = await client.getBatchPriceQuotes(requests);
  
  return holdings.map((holding, index) => {
    const quote = quotes[index];
    if (quote instanceof Error) {
      return { ...holding, error: quote.message };
    }
    
    const price = parseFloat(quote.formattedPrice);
    const amount = parseFloat(holding.amount);
    const value = price * amount;
    
    return {
      ...holding,
      price: quote.formattedPrice,
      value: value.toFixed(2),
      route: describeRoute(quote),
    };
  });
}
```

### Price Monitoring

```typescript
async function monitorPrice(chainId: ChainId, fromToken: string, toToken: string) {
  const client = new ChainlinkRegistryClient({ baseUrl: 'https://api.example.com' });
  
  setInterval(async () => {
    try {
      const quote = await client.getPriceQuote(chainId, fromToken, toToken);
      const age = getPriceAge(quote.updatedAt);
      
      console.log(`${fromToken}/${toToken}: ${quote.formattedPrice} (${age}s old)`);
      
      if (isPriceStale(quote.updatedAt, 300)) { // 5 minutes
        console.warn('⚠️ Price data is stale');
      }
    } catch (error) {
      console.error('Failed to fetch price:', error.message);
    }
  }, 10000); // Check every 10 seconds
}
```

## License

MIT