import type { ChainId } from "./types";

/**
 * Supported blockchain networks (based on ponder config)
 */
export const SUPPORTED_CHAINS: Record<
	ChainId,
	{ name: string; symbol: string }
> = {
	1: { name: "Ethereum", symbol: "ETH" },
	10: { name: "Optimism", symbol: "ETH" },
	100: { name: "Gnosis", symbol: "xDAI" },
	130: { name: "Unichain", symbol: "ETH" },
	137: { name: "Polygon", symbol: "MATIC" },
	146: { name: "Sonic", symbol: "S" },
	324: { name: "zkSync Era", symbol: "ETH" },
	1868: { name: "Soneium", symbol: "ETH" },
	5000: { name: "Mantle", symbol: "MNT" },
	8453: { name: "Base", symbol: "ETH" },
	42161: { name: "Arbitrum One", symbol: "ETH" },
	42220: { name: "Celo", symbol: "CELO" },
	43114: { name: "Avalanche", symbol: "AVAX" },
	57073: { name: "Ink", symbol: "ETH" },
	59144: { name: "Linea", symbol: "ETH" },
	60808: { name: "BOB", symbol: "ETH" },
	534352: { name: "Scroll", symbol: "ETH" },
};

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG = {
	timeout: 10000,
	maxHops: 3,
	decimals: 18,
} as const;

/**
 * API endpoints
 */
export const ENDPOINTS = {
	PRICE_QUOTE: "/price/quote",
	TOKENS: "/price/tokens",
	HEALTH: "/price/health",
} as const;
