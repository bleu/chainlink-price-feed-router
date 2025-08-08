import { type Context, ponder } from "ponder:registry";
import { dataFeed, newRound, priceUpdate } from "ponder:schema";
import { AccessControlledOffchainAggregatorAbi } from "../abis/AccessControlledOffchainAggregatorAbi";

/**
 * Format price with proper decimal handling
 */
function formatPrice(price: bigint, decimals: number = 8): string {
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

/**
 * Find the data feed ID for an aggregator address
 */
async function findDataFeedId(
	context: Context,
	chainId: number,
	aggregatorAddress: string,
): Promise<string | null> {
	try {
		const feed = await context.db.sql.query.dataFeed.findFirst({
			where: (dataFeed, { and, eq }) =>
				and(
					eq(dataFeed.aggregatorAddress, aggregatorAddress.toLowerCase()),
					eq(dataFeed.chainId, chainId),
				),
		});

		return feed?.id ?? null;
	} catch (error) {
		console.warn(
			`Failed to find data feed for aggregator ${aggregatorAddress}:`,
			error,
		);
		return null;
	}
}

/**
 * Get decimals for an aggregator (try to fetch from contract or use default)
 */
async function getAggregatorDecimals(
	context: Context,
	aggregatorAddress: string,
): Promise<number> {
	try {
		const decimals = await context.client.readContract({
			address: aggregatorAddress as `0x${string}`,
			abi: AccessControlledOffchainAggregatorAbi,
			functionName: "decimals",
		});
		return decimals;
	} catch (error) {
		console.warn(
			`Failed to get decimals for ${aggregatorAddress}, using default 8:`,
			error,
		);
		return 8; // Default for most Chainlink feeds
	}
}

// This will be dynamically generated for each chain's aggregators
// Example for ethereum aggregators:
ponder.on(
	"AccessControlledOffchainAggregator:AnswerUpdated",
	async ({ event, context }) => {
		const { current, roundId, updatedAt } = event.args;
		const aggregatorAddress = event.log.address.toLowerCase();

		// Determine chain ID from context (this will be dynamic per chain)
		const chainId = context.chain.id;

		try {
			// Trust Chainlink's data - zero prices and high round IDs can be legitimate

			console.log(
				`📊 Price update: ${aggregatorAddress} - Round ${roundId} - Price ${current}`,
			);

			// Find associated data feed
			const dataFeedId = await findDataFeedId(
				context,
				chainId,
				aggregatorAddress,
			);

			// Get decimals for proper formatting
			const decimals = await getAggregatorDecimals(context, aggregatorAddress);

			// Format the price
			const formattedPrice = formatPrice(current, decimals);

			// Create unique ID
			const id = `${chainId}-${aggregatorAddress}-${roundId}`;

			// Insert price update
			await context.db.insert(priceUpdate).values({
				id,
				aggregatorAddress,
				dataFeedId,
				chainId,
				roundId,
				price: current.toString(),
				formattedPrice,
				decimals,
				updatedAt,
				blockNumber: event.block.number,
				blockHash: event.block.hash,
				transactionHash: event.transaction.hash,
				logIndex: event.log.logIndex,
				timestamp: event.block.timestamp,
			});

			// Update the data feed's latest price if we found a matching feed
			if (dataFeedId) {
				await context.db.update(dataFeed, { id: dataFeedId }).set({
					latestPrice: current.toString(),
					formattedPrice,
					lastUpdated: updatedAt,
				});
			}

			console.log(
				`✅ Recorded price update: ${formattedPrice} for ${aggregatorAddress}`,
			);
		} catch (error) {
			console.error(
				`❌ Failed to process AnswerUpdated event for ${aggregatorAddress}:`,
				error,
			);
		}
	},
);

ponder.on(
	"AccessControlledOffchainAggregator:NewRound",
	async ({ event, context }) => {
		const { roundId, startedBy, startedAt } = event.args;
		const aggregatorAddress = event.log.address.toLowerCase();
		const chainId = context.chain.id;

		console.log(
			`🔄 New round: ${aggregatorAddress} - Round ${roundId} started by ${startedBy}`,
		);

		try {
			// Find associated data feed
			const dataFeedId = await findDataFeedId(
				context,
				chainId,
				aggregatorAddress,
			);

			// Create unique ID
			const id = `${chainId}-${aggregatorAddress}-${roundId}`;

			// Insert new round event
			await context.db.insert(newRound).values({
				id,
				aggregatorAddress,
				dataFeedId,
				chainId,
				roundId,
				startedBy: startedBy.toLowerCase(),
				startedAt,
				blockNumber: event.block.number,
				blockHash: event.block.hash,
				transactionHash: event.transaction.hash,
				logIndex: event.log.logIndex,
				timestamp: event.block.timestamp,
			});

			console.log(`✅ Recorded new round: ${roundId} for ${aggregatorAddress}`);
		} catch (error) {
			console.error(`❌ Failed to process NewRound event:`, error);
		}
	},
);
