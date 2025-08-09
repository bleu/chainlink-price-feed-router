import { type Context, ponder } from "ponder:registry";
import {
	aggregator,
	dataFeed,
	dataFeedToken,
	flagLowered,
	flagRaised,
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

		// Create aggregator record if we have an aggregator address
		if (metadata.aggregatorAddress && !isIgnored) {
			const aggregatorId = `${chainId}-${metadata.aggregatorAddress.toLowerCase()}`;
			
			await context.db.insert(aggregator).values({
				id: aggregatorId,
				address: metadata.aggregatorAddress.toLowerCase(),
				dataFeedId,
				chainId,
				description: metadata.description,
				decimals: metadata.decimals,
				status: "active",
				createdAt: timestamp,
			}).onConflictDoNothing();
			
			console.info(`🔗 Created aggregator record: ${metadata.aggregatorAddress} -> ${metadata.description}`);
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
