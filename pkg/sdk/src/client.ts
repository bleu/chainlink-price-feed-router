import fetch from "cross-fetch";
import {
	type ApiError,
	ApiResponseError,
	type ChainId,
	type ClientConfig,
	type HealthResponse,
	NetworkError,
	type PriceQuote,
	type PriceQuoteOptions,
	RouteNotFoundError,
	type TokensResponse,
	UnsupportedChainError,
	ValidationError,
} from "./types";

/**
 * Main client for interacting with the Chainlink Registry Price API
 */
export class ChainlinkRegistryClient {
	private readonly baseUrl: string;
	private readonly timeout: number;
	private readonly headers: Record<string, string>;

	constructor(config: ClientConfig) {
		this.baseUrl = config.baseUrl.replace(/\/$/, ""); // Remove trailing slash
		this.timeout = config.timeout ?? 10000;
		this.headers = {
			"Content-Type": "application/json",
			"User-Agent": "@chainlink-registry/sdk",
			...config.headers,
		};
	}

	/**
	 * Make an HTTP request with error handling
	 */
	private async request<T>(endpoint: string): Promise<T> {
		const url = `${this.baseUrl}${endpoint}`;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeout);

		try {
			const response = await fetch(url, {
				method: "GET",
				headers: this.headers,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				let errorData: ApiError;
				try {
					errorData = await response.json();
				} catch {
					errorData = {
						error: `HTTP ${response.status}: ${response.statusText}`,
					};
				}

				// Handle specific error types
				if (response.status === 404 && errorData.error === "No route found") {
					throw new RouteNotFoundError("", "", 0); // Will be overridden by caller
				}

				if (
					response.status === 400 &&
					errorData.message?.includes("not configured")
				) {
					const chainIdMatch = errorData.message.match(/Chain (\d+)/);
					const chainId = chainIdMatch ? parseInt(chainIdMatch[1]) : 0;
					throw new UnsupportedChainError(chainId);
				}

				throw new ApiResponseError(
					errorData.error || `Request failed with status ${response.status}`,
					response.status,
					errorData,
				);
			}

			const data = await response.json();
			return data as T;
		} catch (error) {
			clearTimeout(timeoutId);

			if (error instanceof ChainlinkRegistryClient) {
				throw error; // Re-throw our custom errors
			}

			if (error instanceof Error) {
				if (error.name === "AbortError") {
					throw new NetworkError(`Request timeout after ${this.timeout}ms`);
				}
				throw new NetworkError(`Network error: ${error.message}`, error);
			}

			throw new NetworkError("Unknown network error", error);
		}
	}

	/**
	 * Validate chain ID
	 */
	private validateChainId(chainId: number): void {
		if (!Number.isInteger(chainId) || chainId <= 0) {
			throw new ValidationError(`Invalid chain ID: ${chainId}`);
		}
	}

	/**
	 * Validate token symbol
	 */
	private validateTokenSymbol(symbol: string): void {
		if (!symbol || typeof symbol !== "string" || symbol.trim().length === 0) {
			throw new ValidationError(`Invalid token symbol: ${symbol}`);
		}
	}

	/**
	 * Get a price quote between two tokens
	 *
	 * @param chainId - The blockchain chain ID
	 * @param fromToken - Source token symbol (e.g., 'BTC')
	 * @param toToken - Target token symbol (e.g., 'USD')
	 * @param options - Additional options for the quote
	 * @returns Promise resolving to price quote data
	 *
	 * @example
	 * ```typescript
	 * const client = new ChainlinkRegistryClient({ baseUrl: 'https://api.example.com' });
	 * const quote = await client.getPriceQuote(1, 'BTC', 'USD');
	 * console.log(`1 BTC = ${quote.formattedPrice} USD`);
	 * ```
	 */
	async getPriceQuote(
		chainId: ChainId,
		fromToken: string,
		toToken: string,
		options: PriceQuoteOptions = {},
	): Promise<PriceQuote> {
		this.validateChainId(chainId);
		this.validateTokenSymbol(fromToken);
		this.validateTokenSymbol(toToken);

		const params = new URLSearchParams();
		if (options.maxHops !== undefined) {
			params.set("maxHops", options.maxHops.toString());
		}
		if (options.decimals !== undefined) {
			params.set("decimals", options.decimals.toString());
		}

		const queryString = params.toString();
		const endpoint = `/price/quote/${chainId}/${fromToken.toUpperCase()}/${toToken.toUpperCase()}${
			queryString ? `?${queryString}` : ""
		}`;

		try {
			return await this.request<PriceQuote>(endpoint);
		} catch (error) {
			if (error instanceof RouteNotFoundError) {
				throw new RouteNotFoundError(fromToken, toToken, chainId);
			}
			throw error;
		}
	}

	/**
	 * Get available tokens for a specific chain
	 *
	 * @param chainId - The blockchain chain ID
	 * @returns Promise resolving to available tokens data
	 *
	 * @example
	 * ```typescript
	 * const client = new ChainlinkRegistryClient({ baseUrl: 'https://api.example.com' });
	 * const tokens = await client.getAvailableTokens(1);
	 * console.log(`Available tokens: ${tokens.tokens.join(', ')}`);
	 * ```
	 */
	async getAvailableTokens(chainId: ChainId): Promise<TokensResponse> {
		this.validateChainId(chainId);
		return this.request<TokensResponse>(`/price/tokens/${chainId}`);
	}

	/**
	 * Check the health status of the API
	 *
	 * @returns Promise resolving to health status
	 *
	 * @example
	 * ```typescript
	 * const client = new ChainlinkRegistryClient({ baseUrl: 'https://api.example.com' });
	 * const health = await client.getHealth();
	 * console.log(`API Status: ${health.status}`);
	 * ```
	 */
	async getHealth(): Promise<HealthResponse> {
		return this.request<HealthResponse>("/price/health");
	}

	/**
	 * Get multiple price quotes in parallel
	 *
	 * @param requests - Array of quote requests
	 * @returns Promise resolving to array of price quotes (same order as input)
	 *
	 * @example
	 * ```typescript
	 * const client = new ChainlinkRegistryClient({ baseUrl: 'https://api.example.com' });
	 * const quotes = await client.getBatchPriceQuotes([
	 *   { chainId: 1, fromToken: 'BTC', toToken: 'USD' },
	 *   { chainId: 1, fromToken: 'ETH', toToken: 'USD' },
	 * ]);
	 * ```
	 */
	async getBatchPriceQuotes(
		requests: Array<{
			chainId: ChainId;
			fromToken: string;
			toToken: string;
			options?: PriceQuoteOptions;
		}>,
	): Promise<Array<PriceQuote | Error>> {
		const promises = requests.map(
			async ({ chainId, fromToken, toToken, options }) => {
				try {
					return await this.getPriceQuote(chainId, fromToken, toToken, options);
				} catch (error) {
					return error instanceof Error ? error : new Error(String(error));
				}
			},
		);

		return Promise.all(promises);
	}

	/**
	 * Get price quotes for multiple token pairs on the same chain
	 *
	 * @param chainId - The blockchain chain ID
	 * @param pairs - Array of token pairs
	 * @param options - Options to apply to all quotes
	 * @returns Promise resolving to array of price quotes
	 *
	 * @example
	 * ```typescript
	 * const client = new ChainlinkRegistryClient({ baseUrl: 'https://api.example.com' });
	 * const quotes = await client.getMultiPairQuotes(1, [
	 *   ['BTC', 'USD'],
	 *   ['ETH', 'USD'],
	 *   ['LINK', 'USD'],
	 * ]);
	 * ```
	 */
	async getMultiPairQuotes(
		chainId: ChainId,
		pairs: Array<[string, string]>,
		options: PriceQuoteOptions = {},
	): Promise<Array<PriceQuote | Error>> {
		const requests = pairs.map(([fromToken, toToken]) => ({
			chainId,
			fromToken,
			toToken,
			options,
		}));

		return this.getBatchPriceQuotes(requests);
	}

	/**
	 * Check if a token pair has an available price route
	 *
	 * @param chainId - The blockchain chain ID
	 * @param fromToken - Source token symbol
	 * @param toToken - Target token symbol
	 * @param maxHops - Maximum hops to check (default: 3)
	 * @returns Promise resolving to boolean indicating if route exists
	 *
	 * @example
	 * ```typescript
	 * const client = new ChainlinkRegistryClient({ baseUrl: 'https://api.example.com' });
	 * const hasRoute = await client.hasRoute(1, 'BTC', 'EUR');
	 * console.log(`BTC -> EUR route available: ${hasRoute}`);
	 * ```
	 */
	async hasRoute(
		chainId: ChainId,
		fromToken: string,
		toToken: string,
		maxHops: number = 3,
	): Promise<boolean> {
		try {
			await this.getPriceQuote(chainId, fromToken, toToken, { maxHops });
			return true;
		} catch (error) {
			if (error instanceof RouteNotFoundError) {
				return false;
			}
			throw error; // Re-throw other errors
		}
	}

	/**
	 * Get the current configuration
	 */
	getConfig(): Readonly<{
		baseUrl: string;
		timeout: number;
		headers: Record<string, string>;
	}> {
		return {
			baseUrl: this.baseUrl,
			timeout: this.timeout,
			headers: { ...this.headers },
		};
	}
}
