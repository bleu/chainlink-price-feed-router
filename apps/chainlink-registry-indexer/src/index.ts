import { type Context, ponder } from "ponder:registry";
import {
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
	fetchDataFeedMetadata,
	formatPrice,
	parseTokensFromDescription,
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
		// Fetch enhanced metadata from the aggregator contract
		const metadata = await fetchDataFeedMetadata(
			context,
			address as `0x${string}`,
		);

		if (!metadata || !metadata.description) {
			console.warn(
				`No metadata found for data feed ${address} on chain ${chainId}`,
			);
			return;
		}

		// Skip non-price feed descriptions (emergency counts, etc.)
		if (
			metadata.description.includes("Emergency Count") ||
			metadata.description.includes("Network") ||
			metadata.description.includes("Count")
		) {
			console.log(`Skipping non-price feed: ${metadata.description}`);
			return;
		}

		// Try to create data feed record (will fail if already exists)
		try {
			await context.db.insert(dataFeed).values({
				id: dataFeedId,
				address: address.toLowerCase(),
				description: metadata.description,
				chainId,
				status: "active",
				decimals: metadata.decimals,
				version: metadata.version,
				latestPrice: metadata.latestPrice.toString(),
				formattedPrice: formatPrice(metadata.latestPrice, metadata.decimals),
				lastUpdated: metadata.lastUpdated,
				createdAt: timestamp,
			});
		} catch (_error) {
			// Data feed already exists, skip processing
			return;
		}

		// Parse tokens from description
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

		console.log(
			`Processed data feed ${address} on chain ${chainId}: ${metadata.description}`,
		);
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

		console.log(`Deprecated data feed ${address} on chain ${chainId}`);
	} catch (error) {
		console.error(
			`Failed to deprecate data feed ${address} on chain ${chainId}:`,
			error,
		);
	}
}

// FlagRaised events across all chains
ponder.on("ChainLinkDataFeedFlags:FlagRaised", async ({ event, context }) => {
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
});

// FlagLowered events across all chains
ponder.on("ChainLinkDataFeedFlags:FlagLowered", async ({ event, context }) => {
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
});
