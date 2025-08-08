/**
 * Configuration options for the ChainlinkRegistryClient
 */
export interface ClientConfig {
	/** Base URL of the Chainlink Registry API */
	baseUrl: string;
	/** Request timeout in milliseconds (default: 10000) */
	timeout?: number;
	/** Custom headers to include with requests */
	headers?: Record<string, string>;
}

/**
 * Supported chain IDs (based on ponder config)
 */
export type ChainId =
	| 1 // Ethereum
	| 10 // Optimism
	| 100 // Gnosis
	| 130 // Unichain
	| 137 // Polygon
	| 146 // Sonic
	| 324 // zkSync Era
	| 1868 // Soneium
	| 5000 // Mantle
	| 8453 // Base
	| 42161 // Arbitrum One
	| 42220 // Celo
	| 43114 // Avalanche
	| 57073 // Ink
	| 59144 // Linea
	| 60808 // BOB
	| 534352; // Scroll

/**
 * Price conversion type in a route
 */
export type ConversionType = "direct" | "inverse";

/**
 * Individual conversion step in a price route
 */
export interface PriceConversion {
	/** Address of the Chainlink data feed */
	address: string;
	/** Human-readable description of the feed */
	description: string;
	/** Type of conversion (direct or inverse) */
	conversionType: ConversionType;
	/** Raw price from the feed */
	feedPrice: string;
	/** Formatted price from the feed */
	feedFormattedPrice: string;
	/** Number of decimals in the feed price */
	decimals: number;
	/** ISO timestamp when the feed was last updated */
	updatedAt: string;
}

/**
 * Price route information
 */
export interface PriceRoute {
	/** Array of token symbols in the conversion path */
	path: string[];
	/** Number of hops in the route */
	hops: number;
	/** Array of conversion steps */
	conversions: PriceConversion[];
}

/**
 * Price quote response
 */
export interface PriceQuote {
	/** Source token symbol */
	fromToken: string;
	/** Target token symbol */
	toToken: string;
	/** Chain ID */
	chainId: number;
	/** Raw price with specified decimals */
	price: string;
	/** Human-readable formatted price */
	formattedPrice: string;
	/** Number of decimals in the price */
	decimals: number;
	/** Route information */
	route: PriceRoute;
	/** ISO timestamp of the oldest price data used */
	updatedAt: string;
	/** Unix timestamp when the quote was generated */
	timestamp: number;
}

/**
 * Available tokens response
 */
export interface TokensResponse {
	/** Chain ID */
	chainId: number;
	/** Array of available token symbols */
	tokens: string[];
	/** Number of available tokens */
	count: number;
}

/**
 * Health check response
 */
export interface HealthResponse {
	/** Service status */
	status: "ok" | "error";
	/** ISO timestamp */
	timestamp: string;
	/** Service name */
	service: string;
}

/**
 * API error response
 */
export interface ApiError {
	/** Error message */
	error: string;
	/** Additional error details */
	message?: string;
}

/**
 * Options for price quote requests
 */
export interface PriceQuoteOptions {
	/** Maximum number of hops allowed in the route (default: 3) */
	maxHops?: number;
	/** Target decimal precision for the result (default: 18) */
	decimals?: number;
}

/**
 * SDK Error types
 */
export class ChainlinkRegistryError extends Error {
	constructor(
		message: string,
		public readonly code: string,
		public readonly statusCode?: number,
		public readonly details?: unknown,
	) {
		super(message);
		this.name = "ChainlinkRegistryError";
	}
}

/**
 * Network error
 */
export class NetworkError extends ChainlinkRegistryError {
	constructor(message: string, details?: unknown) {
		super(message, "NETWORK_ERROR", undefined, details);
		this.name = "NetworkError";
	}
}

/**
 * API error
 */
export class ApiResponseError extends ChainlinkRegistryError {
	constructor(message: string, statusCode: number, details?: unknown) {
		super(message, "API_ERROR", statusCode, details);
		this.name = "ApiResponseError";
	}
}

/**
 * Validation error
 */
export class ValidationError extends ChainlinkRegistryError {
	constructor(message: string, details?: unknown) {
		super(message, "VALIDATION_ERROR", undefined, details);
		this.name = "ValidationError";
	}
}

/**
 * Route not found error
 */
export class RouteNotFoundError extends ChainlinkRegistryError {
	constructor(fromToken: string, toToken: string, chainId: number) {
		super(
			`No price route found between ${fromToken} and ${toToken} on chain ${chainId}`,
			"ROUTE_NOT_FOUND",
			404,
			{ fromToken, toToken, chainId },
		);
		this.name = "RouteNotFoundError";
	}
}

/**
 * Unsupported chain error
 */
export class UnsupportedChainError extends ChainlinkRegistryError {
	constructor(chainId: number) {
		super(`Chain ${chainId} is not supported`, "UNSUPPORTED_CHAIN", 400, {
			chainId,
		});
		this.name = "UnsupportedChainError";
	}
}
