import { SUPPORTED_CHAINS } from "./constants";
import type { ChainId, PriceQuote } from "./types";

/**
 * Check if a chain ID is supported
 */
export function isSupportedChain(chainId: number): chainId is ChainId {
	return chainId in SUPPORTED_CHAINS;
}

/**
 * Get chain information by chain ID
 */
export function getChainInfo(chainId: ChainId) {
	return SUPPORTED_CHAINS[chainId];
}

/**
 * Format a price string with proper decimal handling
 */
export function formatPrice(price: string, decimals: number = 18): string {
	const priceNum = BigInt(price);
	const divisor = 10n ** BigInt(decimals);
	const wholePart = priceNum / divisor;
	const fractionalPart = priceNum % divisor;

	if (fractionalPart === 0n) {
		return wholePart.toString();
	}

	const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
	const trimmedFractional = fractionalStr.replace(/0+$/, "");

	if (trimmedFractional === "") {
		return wholePart.toString();
	}

	return `${wholePart}.${trimmedFractional}`;
}

/**
 * Parse a formatted price back to raw price string
 */
export function parsePrice(
	formattedPrice: string,
	decimals: number = 18,
): string {
	const [wholePart = "0", fractionalPart = ""] = formattedPrice.split(".");
	const paddedFractional = fractionalPart
		.padEnd(decimals, "0")
		.slice(0, decimals);
	const rawPrice =
		BigInt(wholePart) * 10n ** BigInt(decimals) + BigInt(paddedFractional);
	return rawPrice.toString();
}

/**
 * Calculate the age of price data in seconds
 */
export function getPriceAge(updatedAt: string): number {
	const updatedTime = new Date(updatedAt).getTime();
	const currentTime = Date.now();
	return Math.floor((currentTime - updatedTime) / 1000);
}

/**
 * Check if price data is stale (older than specified seconds)
 */
export function isPriceStale(
	updatedAt: string,
	maxAgeSeconds: number = 3600,
): boolean {
	return getPriceAge(updatedAt) > maxAgeSeconds;
}

/**
 * Get the oldest timestamp from a price quote route
 */
export function getOldestTimestamp(quote: PriceQuote): string {
	if (quote.route.conversions.length === 0) {
		return quote.updatedAt;
	}

	return quote.route.conversions.reduce((oldest, conversion) => {
		return new Date(conversion.updatedAt) < new Date(oldest)
			? conversion.updatedAt
			: oldest;
	}, quote.route.conversions[0].updatedAt);
}

/**
 * Calculate the total slippage/spread across a route
 */
export function calculateRouteComplexity(quote: PriceQuote): {
	hops: number;
	totalFeeds: number;
	hasInverseConversions: boolean;
	averageDataAge: number;
} {
	const { route } = quote;
	const hasInverseConversions = route.conversions.some(
		(c) => c.conversionType === "inverse",
	);
	const totalDataAge = route.conversions.reduce(
		(sum, c) => sum + getPriceAge(c.updatedAt),
		0,
	);
	const averageDataAge =
		route.conversions.length > 0 ? totalDataAge / route.conversions.length : 0;

	return {
		hops: route.hops,
		totalFeeds: route.conversions.length,
		hasInverseConversions,
		averageDataAge,
	};
}

/**
 * Validate token symbol format
 */
export function isValidTokenSymbol(symbol: string): boolean {
	return /^[A-Z0-9]{1,10}$/.test(symbol);
}

/**
 * Normalize token symbol (uppercase, trim)
 */
export function normalizeTokenSymbol(symbol: string): string {
	return symbol.trim().toUpperCase();
}

/**
 * Create a human-readable route description
 */
export function describeRoute(quote: PriceQuote): string {
	const { route, fromToken, toToken } = quote;

	if (route.hops === 0) {
		return `${fromToken} = ${toToken}`;
	}

	if (route.hops === 1) {
		const conversion = route.conversions[0];
		return `${fromToken} → ${toToken} (${conversion.description})`;
	}

	const pathDescription = route.path.join(" → ");
	return `${pathDescription} (${route.hops} hops)`;
}

/**
 * Extract feed addresses from a quote
 */
export function getFeedAddresses(quote: PriceQuote): string[] {
	return quote.route.conversions.map((c) => c.address);
}

/**
 * Check if two quotes are for the same token pair and chain
 */
export function isSameTokenPair(
	quote1: PriceQuote,
	quote2: PriceQuote,
): boolean {
	return (
		quote1.chainId === quote2.chainId &&
		quote1.fromToken === quote2.fromToken &&
		quote1.toToken === quote2.toToken
	);
}

/**
 * Compare two quotes and return the one with better characteristics
 * (fewer hops, fresher data, etc.)
 */
export function comparePriceQuotes(
	quote1: PriceQuote,
	quote2: PriceQuote,
): PriceQuote {
	if (!isSameTokenPair(quote1, quote2)) {
		throw new Error("Cannot compare quotes for different token pairs");
	}

	// Prefer fewer hops
	if (quote1.route.hops !== quote2.route.hops) {
		return quote1.route.hops < quote2.route.hops ? quote1 : quote2;
	}

	// Prefer fresher data
	const age1 = getPriceAge(getOldestTimestamp(quote1));
	const age2 = getPriceAge(getOldestTimestamp(quote2));

	return age1 < age2 ? quote1 : quote2;
}

/**
 * Convert price between different decimal precisions
 */
export function convertPriceDecimals(
	price: string,
	fromDecimals: number,
	toDecimals: number,
): string {
	const priceNum = BigInt(price);

	if (fromDecimals === toDecimals) {
		return price;
	}

	if (fromDecimals < toDecimals) {
		const multiplier = 10n ** BigInt(toDecimals - fromDecimals);
		return (priceNum * multiplier).toString();
	} else {
		const divisor = 10n ** BigInt(fromDecimals - toDecimals);
		return (priceNum / divisor).toString();
	}
}
