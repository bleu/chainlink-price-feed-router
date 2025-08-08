/**
 * @chainlink-registry/sdk
 *
 * TypeScript SDK for Chainlink Registry Price API
 *
 * @example
 * ```typescript
 * import { ChainlinkRegistryClient } from '@chainlink-registry/sdk';
 *
 * const client = new ChainlinkRegistryClient({
 *   baseUrl: 'https://your-api-url.com'
 * });
 *
 * // Get a price quote
 * const quote = await client.getPriceQuote(1, 'BTC', 'USD');
 * console.log(`1 BTC = ${quote.formattedPrice} USD`);
 *
 * // Get available tokens
 * const tokens = await client.getAvailableTokens(1);
 * console.log('Available tokens:', tokens.tokens);
 * ```
 */

// Main client
export { ChainlinkRegistryClient } from "./client";
// Constants
export {
	DEFAULT_CONFIG,
	ENDPOINTS,
	SUPPORTED_CHAINS,
} from "./constants";
// Types
export type {
	ApiError,
	ChainId,
	ClientConfig,
	ConversionType,
	HealthResponse,
	PriceConversion,
	PriceQuote,
	PriceQuoteOptions,
	PriceRoute,
	TokensResponse,
} from "./types";
// Error classes
export {
	ApiResponseError,
	ChainlinkRegistryError,
	NetworkError,
	RouteNotFoundError,
	UnsupportedChainError,
	ValidationError,
} from "./types";

// Utilities
export {
	calculateRouteComplexity,
	comparePriceQuotes,
	convertPriceDecimals,
	describeRoute,
	formatPrice,
	getChainInfo,
	getFeedAddresses,
	getOldestTimestamp,
	getPriceAge,
	isPriceStale,
	isSameTokenPair,
	isSupportedChain,
	isValidTokenSymbol,
	normalizeTokenSymbol,
	parsePrice,
} from "./utils";

// Default export for convenience
import { ChainlinkRegistryClient } from "./client";
export default ChainlinkRegistryClient;
