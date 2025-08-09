import { type Context, ponder } from "ponder:registry";
import {
	dataFeed,
	dataFeedToken,
	flagLowered,
	flagRaised,
	newRound,
	priceUpdate,
	token,
} from "../ponder.schema";
import {
	createDataFeedId,
	createDataFeedTokenId,
	createTokenId,
	fetchDataFeedMetadataWithAggregator,
	parseTokensFromDescription,
	shouldIgnoreFeed,
} from "./utils/dataFeedUtils";
import { findTokenBySymbol } from "./utils/tokenRegistry";

// Helper to format price with decimals
function formatPrice(rawPrice: string, decimals: number): string {
	if (decimals === 0) return rawPrice;

	const price = BigInt(rawPrice);
	const divisor = BigInt(10 ** decimals);
	const wholePart = price / divisor;
	const fractionalPart = price % divisor;

	if (fractionalPart === 0n) {
		return wholePart.toString();
	}

	const fractionalStr = fractionalPart.toString().padStart(decimals, "0");
	const trimmedFractional = fractionalStr.replace(/0+$/, "");

	return `${wholePart}.${trimmedFractional}`;
}

async function processDataFeedCreation(
	address: string,
	chainId: number,
	timestamp: bigint,
	context: Context,
) {
	const dataFeedId = createDataFeedId(chainId, address);

	try {
		// Fetch enhanced metadata and aggregator address in a single multicall
		const metadata = await fetchDataFeedMetadataWithAggregator(
			context,
			address as `0x${string}`,
		);

		if (!metadata || !metadata.description) {
			console.warn(
				`No metadata found for data feed ${address} on chain ${chainId}`,
			);
			return;
		}

		// Check if this is a non-price feed that should be ignored
		const isIgnored = shouldIgnoreFeed(metadata.description);
		if (isIgnored) {
			console.info(`📝 Creating ignored data feed: ${metadata.description}`);
		}

		// Try to create data feed record (will fail if already exists)
		try {
			await context.db.insert(dataFeed).values({
				id: dataFeedId,
				address: address.toLowerCase(),
				aggregatorAddress: metadata.aggregatorAddress?.toLowerCase() || null,
				description: metadata.description,
				chainId,
				status: "active",
				ignored: isIgnored,
				decimals: metadata.decimals,
				version: metadata.version,
				latestPrice: "0", // Will be populated by price update events
				formattedPrice: "0", // Will be populated by price update events
				lastUpdated: 0n, // Will be populated by price update events
				createdAt: timestamp,
			});
		} catch (_error) {
			// Data feed already exists, skip processing
			return;
		}

		// Only process tokens for non-ignored feeds
		if (!isIgnored) {
			const tokens = parseTokensFromDescription(metadata.description);

			for (let i = 0; i < tokens.length; i++) {
				const tokenSymbol = tokens[i];
				if (!tokenSymbol) {
					console.warn(
						`No token symbol found for data feed ${address} on chain ${chainId}`,
					);
					continue;
				}

				const tokenId = createTokenId(tokenSymbol, chainId);

				// Look up token info from 1inch token list
				const tokenInfo = findTokenBySymbol(tokenSymbol, chainId);

				// Use upsert pattern for tokens to handle duplicates
				await context.db
					.insert(token)
					.values({
						id: tokenId,
						symbol: tokenSymbol,
						chainId,
						address: tokenInfo?.address || null,
						createdAt: timestamp,
					})
					.onConflictDoNothing();

				// Create data feed token relationship
				const dataFeedTokenId = createDataFeedTokenId(dataFeedId, tokenId, i);
				await context.db.insert(dataFeedToken).values({
					id: dataFeedTokenId,
					dataFeedId,
					tokenId,
					position: i,
				});
			}
		}
	} catch (error) {
		console.error(
			`Failed to process data feed ${address} on chain ${chainId}:`,
			error,
		);
	}
}

async function processDataFeedDeprecation(
	address: string,
	chainId: number,
	timestamp: bigint,
	context: Context,
) {
	const dataFeedId = createDataFeedId(chainId, address);

	try {
		// Update data feed status to deprecated
		await context.db.update(dataFeed, { id: dataFeedId }).set({
			status: "deprecated",
			deprecatedAt: timestamp,
		});
	} catch (error) {
		console.error(
			`Failed to deprecate data feed ${address} on chain ${chainId}:`,
			error,
		);
	}
}

// === FLAGS EVENTS ===

// FlagRaised events across all chains
ponder.on(
	"ChainLinkDataFeedFlags:FlagRaised",
	async ({ event, context }: any) => {
		await context.db.insert(flagRaised).values({
			id: `${context.chain.id}-${event.block.hash}-${event.log.logIndex}`,
			subject: event.args.subject,
			chainId: context.chain.id,
			blockNumber: event.block.number,
			blockHash: event.block.hash,
			transactionHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			timestamp: event.block.timestamp,
		});

		// Process the data feed creation (subject is the aggregator address)
		await processDataFeedCreation(
			event.args.subject,
			context.chain.id,
			event.block.timestamp,
			context,
		);
	},
);

// FlagLowered events across all chains
ponder.on(
	"ChainLinkDataFeedFlags:FlagLowered",
	async ({ event, context }: any) => {
		await context.db.insert(flagLowered).values({
			id: `${context.chain.id}-${event.block.hash}-${event.log.logIndex}`,
			subject: event.args.subject,
			chainId: context.chain.id,
			blockNumber: event.block.number,
			blockHash: event.block.hash,
			transactionHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			timestamp: event.block.timestamp,
		});

		// Process the data feed deprecation (subject is the aggregator address)
		await processDataFeedDeprecation(
			event.args.subject,
			context.chain.id,
			event.block.timestamp,
			context,
		);
	},
);

// === AGGREGATOR EVENTS ===

// AnswerUpdated events from aggregators
ponder.on(
	"AccessControlledOffchainAggregator:AnswerUpdated",
	async ({ event, context }: any) => {
		const aggregatorAddress = event.log.address.toLowerCase();

		// Create price update record
		await context.db.insert(priceUpdate).values({
			id: `${context.chain.id}-${event.block.hash}-${event.log.logIndex}`,
			aggregatorAddress,
			dataFeedId: null, // Will be linked later if we find the data feed
			chainId: context.chain.id,
			roundId: event.args.roundId,
			price: event.args.current.toString(),
			formattedPrice: null, // Will be set when we know decimals
			decimals: null, // Will be fetched from data feed
			updatedAt: event.args.updatedAt,
			blockNumber: event.block.number,
			blockHash: event.block.hash,
			transactionHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			timestamp: event.block.timestamp,
		});

		// Try to find and update the corresponding data feed
		try {
			// Look for data feed with this aggregator address
			const dataFeeds = await context.db
				.select()
				.from(dataFeed)
				.where({
					aggregatorAddress,
					chainId: context.chain.id,
					status: "active",
					ignored: false,
				})
				.limit(1);

			if (dataFeeds.length > 0) {
				const feed = dataFeeds[0];
				const formattedPrice = feed.decimals
					? formatPrice(event.args.current.toString(), feed.decimals)
					: event.args.current.toString();

				// Update the data feed with latest price
				await context.db.update(dataFeed, { id: feed.id }).set({
					latestPrice: event.args.current.toString(),
					formattedPrice,
					lastUpdated: event.args.updatedAt,
				});

				// Update the price update record with data feed info
				await context.db
					.update(priceUpdate, {
						id: `${context.chain.id}-${event.block.hash}-${event.log.logIndex}`,
					})
					.set({
						dataFeedId: feed.id,
						decimals: feed.decimals,
						formattedPrice,
					});
			}
		} catch (error) {
			console.error(
				`Failed to update data feed for aggregator ${aggregatorAddress}:`,
				error,
			);
		}
	},
);

// NewRound events from aggregators
ponder.on(
	"AccessControlledOffchainAggregator:NewRound",
	async ({ event, context }: any) => {
		const aggregatorAddress = event.log.address.toLowerCase();

		// Create new round record
		await context.db.insert(newRound).values({
			id: `${context.chain.id}-${event.block.hash}-${event.log.logIndex}`,
			aggregatorAddress,
			dataFeedId: null, // Will be linked later if we find the data feed
			chainId: context.chain.id,
			roundId: event.args.roundId,
			startedBy: event.args.startedBy,
			startedAt: event.args.startedAt,
			blockNumber: event.block.number,
			blockHash: event.block.hash,
			transactionHash: event.transaction.hash,
			logIndex: event.log.logIndex,
			timestamp: event.block.timestamp,
		});

		// Try to link to data feed
		try {
			const dataFeeds = await context.db
				.select()
				.from(dataFeed)
				.where({
					aggregatorAddress,
					chainId: context.chain.id,
					status: "active",
					ignored: false,
				})
				.limit(1);

			if (dataFeeds.length > 0) {
				await context.db
					.update(newRound, {
						id: `${context.chain.id}-${event.block.hash}-${event.log.logIndex}`,
					})
					.set({
						dataFeedId: dataFeeds[0].id,
					});
			}
		} catch (error) {
			console.error(
				`Failed to link new round to data feed for aggregator ${aggregatorAddress}:`,
				error,
			);
		}
	},
);
