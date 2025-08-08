# Chainlink Registry & Price API

A comprehensive indexer and API for Chainlink data feeds that provides real-time price calculations between any two tokens using derived price methodology.

## 🚀 Features

- **Multi-Chain Support**: Index Chainlink data feeds across 17+ supported networks
- **Official Feed Registry**: Uses Chainlink's Flags Contract Registry for authentic feed verification
- **Derived Price Calculations**: Calculate prices between any token pair using Chainlink's official methodology
- **Smart Routing**: Find optimal price routes through multiple data feeds
- **Real-Time Data**: Live price feeds with staleness detection
- **Token Registry**: Integration with 1inch token list for address resolution
- **GraphQL & REST APIs**: Multiple ways to query data
- **Price Verification**: Full transparency into calculation steps

## 📊 How It Works

### Data Feed Indexing
The system uses Chainlink's **Flags Contract Registry** as the official source of truth for active data feeds. It monitors `FlagRaised` and `FlagLowered` events to:
- Discover new data feeds automatically from official Chainlink registry
- Track feed status (active/deprecated) - inactive feeds are removed from registry
- Extract token pairs from feed descriptions
- Store enhanced metadata (decimals, version, latest price)
- Verify feed authenticity (only official Chainlink-operated feeds)

### Price Calculation
Uses Chainlink's derived price methodology:

```
Direct Feed: ETH/USD → Use price directly
Derived Price: BTC/EUR = (BTC/USD) ÷ (EUR/USD)  
Multi-hop: TOKEN_A/TOKEN_D = (TOKEN_A/USD) × (USD/TOKEN_B) × (TOKEN_B/TOKEN_D)
```

### Smart Routing
- **Directed Graph**: Proper mathematical approach with clear conversion directions
- **BFS Pathfinding**: Finds shortest routes between any token pair
- **Cycle Prevention**: Avoids infinite loops in complex token networks
- **Multiple Routes**: Returns alternative paths when available

## 🛠 Installation

### Prerequisites
- Node.js 18+
- PostgreSQL database
- RPC endpoints for supported chains

### Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd chainlink-registry/chainlink-registry-indexer
```

2. **Install dependencies**
```bash
pnpm install
```

3. **Configure environment**
```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/chainlink_registry"
DRPC_API_KEY="your_drpc_api_key_here"
```

4. **Start the indexer**
```bash
pnpm dev
```

The indexer will start syncing data feeds and the API will be available at `http://localhost:42069`

## 🔌 API Usage

### Price Quote API

Get the best price route between two tokens:

```bash
curl "http://localhost:42069/price/quote/8453/USDT/USDC"
```

**Live Response from Base Chain:**
```json
{
  "fromToken": "USDT",
  "toToken": "USDC", 
  "chainId": 8453,
  "price": "1000200397190070964",
  "formattedPrice": "1.000200397190070964",
  "decimals": 18,
  "route": {
    "path": ["USDT", "USD", "USDC"],
    "hops": 2,
    "conversions": [
      {
        "address": "0xf19d560eb8d2adf07bd6d13ed03e1d11215721f9",
        "description": "USDT / USD",
        "conversionType": "direct",
        "feedPrice": "100011460",
        "feedFormattedPrice": "1.0001146",
        "decimals": 8,
        "updatedAt": "2025-08-08T07:11:01.000Z"
      },
      {
        "address": "0x7e860098f58bbfc8648a4311b374b1d669a2bc6b",
        "description": "USDC / USD", 
        "conversionType": "inverse",
        "feedPrice": "99991422",
        "feedFormattedPrice": "0.99991422",
        "decimals": 8,
        "updatedAt": "2025-08-07T15:06:07.000Z"
      }
    ]
  },
  "updatedAt": "2025-08-07T15:06:07.000Z",
  "timestamp": 1754661326647
}
```

**Manual Verification:**
```
USDT → USD: 1 USDT × 1.0001146 = 1.0001146 USD
USD → USDC: 1.0001146 USD ÷ 0.99991422 = 1.000200397 USDC ✅
```

### Available Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /price/quote/:chainId/:fromToken/:toToken` | Get price quote between tokens |
| `GET /price/tokens/:chainId` | List available tokens for a chain |
| `GET /price/health` | API health check |
| `GET /graphql` | GraphQL endpoint for complex queries |
| `GET /sql/*` | Direct SQL queries |

### Query Parameters

- `maxHops`: Maximum route hops (default: 3)
- `decimals`: Target decimal precision (default: 18)

## 📈 Examples

### JavaScript/TypeScript
```typescript
async function getPrice(from: string, to: string, chainId: number = 1) {
  const response = await fetch(
    `http://localhost:42069/price/quote/${chainId}/${from}/${to}`
  );
  
  if (!response.ok) {
    throw new Error(`Price not available: ${response.statusText}`);
  }
  
  return await response.json();
}

// Usage
const btcEurPrice = await getPrice('BTC', 'EUR');
console.log(`1 BTC = ${btcEurPrice.formattedPrice} EUR`);

// Verify calculation manually
btcEurPrice.route.conversions.forEach((conversion, i) => {
  console.log(`Step ${i + 1}: ${conversion.description} = ${conversion.feedFormattedPrice}`);
});
```

### Python
```python
import requests

def get_price(from_token, to_token, chain_id=1):
    url = f"http://localhost:42069/price/quote/{chain_id}/{from_token}/{to_token}"
    response = requests.get(url)
    response.raise_for_status()
    return response.json()

# Usage
price_data = get_price('ETH', 'USD')
print(f"1 ETH = {price_data['formattedPrice']} USD")
```

### GraphQL
```graphql
query GetDataFeeds($chainId: Int!) {
  dataFeeds(where: { chainId: $chainId, status: "active" }) {
    items {
      address
      description
      formattedPrice
      lastUpdated
      dataFeedTokens {
        items {
          token {
            symbol
            address
          }
          position
        }
      }
    }
  }
}
```

## 🏗 Architecture

### Components

- **Indexer** (`src/index.ts`): Processes Chainlink events and builds data feed registry
- **Price API** (`src/api/index.ts`): REST endpoints for price calculations
- **Database Schema** (`ponder.schema.ts`): Data models for feeds, tokens, and relationships
- **Utilities** (`src/utils/`): Price calculation and token registry helpers

### Data Flow

1. **Event Detection**: Monitor `FlagRaised`/`FlagLowered` events
2. **Metadata Fetching**: Call aggregator contracts for feed details
3. **Token Extraction**: Parse token pairs from descriptions
4. **Graph Building**: Create directed graph of price conversions
5. **Route Finding**: Use BFS to find optimal paths
6. **Price Calculation**: Chain conversions using proper mathematics

## 🔧 Configuration

### Supported Chains

All chains with official Chainlink Flags Contract Registry support:

| Chain | ID | Flags Contract | Status |
|-------|----|----|----| 
| Ethereum | 1 | `0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e` | ✅ Active |
| Arbitrum | 42161 | `0x20551B03c092D998b1410c47BD54004D7C3106D0` | ✅ Active |
| Avalanche | 43114 | `0x71c5CC2aEB9Fa812CA360E9bAC7108FC23312cdd` | ✅ Active |
| Base | 8453 | `0x71c5CC2aEB9Fa812CA360E9bAC7108FC23312cdd` | ✅ Active |
| Bob | 60808 | `0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e` | ✅ Active |
| BNB Chain (BSC) | 56 | `0x141f4278A5D71070Dc09CA276b72809b80F20eF0` | ⚠️ Disabled* |
| Celo | 42220 | `0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e` | ✅ Active |
| Gnosis Chain | 100 | `0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e` | ✅ Active |
| Ink | 57073 | `0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e` | ✅ Active |
| Linea | 59144 | `0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e` | ✅ Active |
| Mantle | 5000 | `0x141f4278A5D71070Dc09CA276b72809b80F20eF0` | ✅ Active |
| Optimism | 10 | `0x71c5CC2aEB9Fa812CA360E9bAC7108FC23312cdd` | ✅ Active |
| Polygon | 137 | `0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e` | ✅ Active |
| Scroll | 534352 | `0x141f4278A5D71070Dc09CA276b72809b80F20eF0` | ✅ Active |
| Soneium | 1868 | `0x3DE960FE090BFec72F585347fa0a27CF96a83b36` | ✅ Active |
| Sonic | 146 | `0x141f4278A5D71070Dc09CA276b72809b80F20eF0` | ✅ Active |
| UniChain | 130 | `0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e` | ✅ Active |
| zkSync | 324 | `0xC370405879C1ab0470604679E3275a02bCb89C91` | ✅ Active |

> **Note**: The Flags Contract Registry serves as Chainlink's official source of truth for active data feeds. Only feeds that return `true` when checked against this registry are indexed, ensuring authenticity and current operational status.

> **\*BSC Status**: Currently disabled due to RPC instability issues. Can be re-enabled by uncommenting the BSC configuration in `ponder.config.ts`.

### Environment Variables

```env
# Database
DATABASE_URL="postgresql://..."

# RPC API Key (using DRPC for all chains)
DRPC_API_KEY="your_drpc_api_key"

# Optional: Individual RPC URLs (if not using DRPC)
# PONDER_RPC_URL_1="https://..."        # Ethereum
# PONDER_RPC_URL_137="https://..."      # Polygon
# PONDER_RPC_URL_42161="https://..."    # Arbitrum
# PONDER_RPC_URL_10="https://..."       # Optimism
# PONDER_RPC_URL_8453="https://..."     # Base
# ... (add other chains as needed)

# Optional
PONDER_LOG_LEVEL="info"
PONDER_PORT="42069"
```

> **Tip**: The system is configured to use [DRPC](https://drpc.org) for RPC access across all supported chains with a single API key. You can also configure individual RPC endpoints if preferred.

## 🚨 Error Handling

The system gracefully handles:

- **Stale Price Data**: Detects and warns about outdated feeds
- **Reverted Calls**: Handles `latestRoundData` failures on deprecated feeds
- **Invalid Routes**: Returns 404 when no path exists between tokens
- **Network Issues**: Retries and fallbacks for RPC failures
- **Data Validation**: Checks for zero prices and invalid timestamps

## 🧪 Testing

### Manual Verification

1. **Check Direct Feeds**:
```bash
curl "http://localhost:42069/price/quote/1/ETH/USD"
```

2. **Verify Derived Prices**:
```bash
# Should be reciprocals
curl "http://localhost:42069/price/quote/1/USDC/USDT"
curl "http://localhost:42069/price/quote/1/USDT/USDC"
```

3. **Test Multi-hop Routes**:
```bash
curl "http://localhost:42069/price/quote/1/LINK/EUR"
```

### Price Verification

Use the detailed conversion data to manually verify calculations:

```javascript
// For BTC/EUR route: BTC → USD → EUR
const btcUsdPrice = 45234.56;  // From first conversion
const eurUsdPrice = 1.10;      // From second conversion
const calculatedPrice = btcUsdPrice / eurUsdPrice;  // 41122.33
```

## 📚 Resources

- [Chainlink Data Feeds Documentation](https://docs.chain.link/data-feeds)
- [Ponder Framework](https://ponder.sh)
- [Derived Price Methodology](https://docs.chain.link/data-feeds/using-data-feeds#getting-a-different-price-denomination)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Issues**: Report bugs via GitHub Issues
- **Documentation**: Check the `/price` endpoint for API docs
- **Health Check**: Monitor via `/price/health`

---

Built with ❤️ using [Ponder](https://ponder.sh) and [Chainlink](https://chain.link)