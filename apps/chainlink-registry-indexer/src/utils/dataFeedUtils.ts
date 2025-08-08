import type { Context } from "ponder:registry";
import { AggregatorV3Abi } from "../../abis/AggregatorV3Abi";

export interface DataFeedMetadata {
	description: string;
	decimals: number;
	version: number;
	latestPrice: bigint;
	lastUpdated: bigint;
}

export async function fetchDataFeedMetadata(
	context: Context,
	address: `0x${string}`,
): Promise<DataFeedMetadata | null> {
	try {
		// Fetch basic metadata first (these should not revert)
		const [description, decimals, version] = await Promise.all([
			context.client.readContract({
				address,
				abi: AggregatorV3Abi,
				functionName: "description",
			}),
			context.client.readContract({
				address,
				abi: AggregatorV3Abi,
				functionName: "decimals",
			}),
			context.client.readContract({
				address,
				abi: AggregatorV3Abi,
				functionName: "version",
			}),
		]);

		// Try to fetch latest round data separately with better error handling
		let latestPrice = 0n;
		let lastUpdated = 0n;

		try {
			const latestRoundData = await context.client.readContract({
				address,
				abi: AggregatorV3Abi,
				functionName: "latestRoundData",
			});

			// Validate the round data
			const [roundId, answer, _startedAt, updatedAt, _answeredInRound] =
				latestRoundData;

			// Check for invalid data conditions
			if (roundId === 0n || updatedAt === 0n || answer === 0n) {
				console.warn(
					`Invalid round data for ${address}: roundId=${roundId}, answer=${answer}, updatedAt=${updatedAt}`,
				);
				// Continue without price data but still create the feed
			} else {
				latestPrice = answer;
				lastUpdated = updatedAt;
			}
		} catch (roundDataError) {
			console.warn(
				`Failed to fetch latest round data for ${address}, continuing without price data:`,
				roundDataError,
			);
			// Continue without price data - the feed metadata is still valuable
		}

		return {
			description,
			decimals,
			version,
			latestPrice,
			lastUpdated,
		};
	} catch (error) {
		console.error(`Failed to fetch basic metadata for ${address}:`, error);
		return null;
	}
}

export async function fetchDataFeedDescription(
	context: Context,
	address: `0x${string}`,
): Promise<string> {
	try {
		const description = await context.client.readContract({
			address,
			abi: AggregatorV3Abi,
			functionName: "description",
		});
		return description;
	} catch (error) {
		console.error(`Failed to fetch description for ${address}:`, error);
		return "";
	}
}

export function parseTokensFromDescription(description: string): string[] {
	if (!description) return [];

	// Skip non-price feed descriptions
	if (
		description.includes("Emergency Count") ||
		description.includes("Network") ||
		description.includes("Healthcheck") ||
		description.includes("Count")
	) {
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
