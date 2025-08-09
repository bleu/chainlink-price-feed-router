import type { Context } from "ponder:registry";
import { AggregatorV3Abi } from "../../abis/AggregatorV3Abi";

export interface DataFeedMetadata {
	description: string;
	decimals: number;
	version: number;
	aggregatorAddress: string | null;
}

export async function fetchDataFeedMetadataWithAggregator(
	context: Context,
	address: `0x${string}`,
): Promise<DataFeedMetadata | null> {
	try {
		// Use multicall to fetch all metadata in a single call
		const results = await context.client.multicall({
			contracts: [
				{
					address,
					abi: AggregatorV3Abi,
					functionName: "description",
				},
				{
					address,
					abi: AggregatorV3Abi,
					functionName: "decimals",
				},
				{
					address,
					abi: AggregatorV3Abi,
					functionName: "version",
				},
				{
					address,
					abi: AggregatorV3Abi,
					functionName: "aggregator",
				},
			],
		});

		// Check if all calls succeeded
		if (results.some((result: any) => result.status === "failure")) {
			console.error(`Some metadata calls failed for ${address}`);
			return null;
		}

		return {
			description: results[0].result as string,
			decimals: results[1].result as number,
			version: Number(results[2].result),
			aggregatorAddress: results[3].result as string,
		};
	} catch (error) {
		console.error(
			`Failed to fetch metadata with multicall for ${address}:`,
			error,
		);
		return null;
	}
}

/**
 * Check if a data feed should be ignored based on its description
 */
export function shouldIgnoreFeed(description: string): boolean {
	const desc = description.toLowerCase();

	return (
		// Health/Status feeds
		desc.includes("healthcheck") ||
		desc.includes("uptime") ||
		desc.includes("sequencer") ||
		desc.includes("l2 sequencer") ||
		// Proof of Reserve feeds
		desc.endsWith(" por") ||
		desc.includes("proof of reserve") ||
		desc.includes(" por ") ||
		// Protocol metrics
		desc.includes("debt ratio") ||
		desc.includes("total marketcap") ||
		desc.includes("total supply") ||
		desc.includes("defi pulse") ||
		// Gas/Network feeds
		desc.includes("gas") ||
		desc.includes("gwei") ||
		desc.includes("fast gas") ||
		// Legacy filters
		desc.includes("emergency count") ||
		desc.includes("network") ||
		desc.includes("count") ||
		// Economic indicators and indices
		desc.includes("consumer price index") ||
		desc.includes("secured overnight financing rate") ||
		desc.includes("calculated") ||
		desc.includes(" reserves") ||
		desc.includes(" nav") ||
		desc.includes(" aum") ||
		// Specific nonsensical feeds
		desc.includes("aave llamarisk") ||
		desc.includes("nexus weth") ||
		desc.includes("synthetix aggregator issued synths")
	);
}

export function parseTokensFromDescription(description: string): string[] {
	if (!description) return [];

	// Skip non-price feed descriptions using centralized logic
	if (shouldIgnoreFeed(description)) {
		return [];
	}

	// Clean up description by removing "Exchange Rate" suffix
	const cleanDescription = description.replace(/\s+Exchange Rate$/i, "");

	// Split on both "/" and "-" to handle different formats
	const tokens = cleanDescription
		.split(/[/-]/)
		.map((token) => token.trim())
		.filter((token) => token.length > 0);

	return tokens;
}

export function createDataFeedId(chainId: number, address: string): string {
	return `${chainId}-${address.toLowerCase()}`;
}

export function createTokenId(symbol: string, chainId: number): string {
	return `${chainId}-${symbol.toUpperCase()}`;
}

export function createDataFeedTokenId(
	dataFeedId: string,
	tokenId: string,
	position: number,
): string {
	return `${dataFeedId}-${tokenId}-${position}`;
}

export function formatPrice(price: bigint, decimals: number): string {
	if (price === 0n) return "0";

	const divisor = 10n ** BigInt(decimals);
	const wholePart = price / divisor;
	const fractionalPart = price % divisor;

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
