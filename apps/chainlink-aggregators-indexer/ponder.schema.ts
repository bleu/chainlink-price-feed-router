import { onchainTable, relations } from "ponder";

export const flagRaised = onchainTable("flag_raised", (t) => ({
	id: t.text().primaryKey(),
	subject: t.text().notNull(),
	chainId: t.integer().notNull(),
	blockNumber: t.bigint().notNull(),
	blockHash: t.text().notNull(),
	transactionHash: t.text().notNull(),
	logIndex: t.integer().notNull(),
	timestamp: t.bigint().notNull(),
}));

export const flagLowered = onchainTable("flag_lowered", (t) => ({
	id: t.text().primaryKey(),
	subject: t.text().notNull(),
	chainId: t.integer().notNull(),
	blockNumber: t.bigint().notNull(),
	blockHash: t.text().notNull(),
	transactionHash: t.text().notNull(),
	logIndex: t.integer().notNull(),
	timestamp: t.bigint().notNull(),
}));

export const dataFeed = onchainTable("data_feed", (t) => ({
	id: t.text().primaryKey(),
	address: t.text().notNull(), // Data feed contract address
	aggregatorAddress: t.text(), // Aggregator contract address (from aggregator() method)
	description: t.text().notNull(),
	chainId: t.integer().notNull(),
	status: t.text().notNull().default("active"), // "active" or "deprecated"
	ignored: t.boolean().notNull().default(false), // true for non-price feeds (PoR, etc.)
	decimals: t.integer(),
	version: t.integer(),
	latestPrice: t.text(), // Raw price value as string
	formattedPrice: t.text(), // Human-readable price (e.g., "1234.56")
	lastUpdated: t.bigint(),
	createdAt: t.bigint().notNull(),
	deprecatedAt: t.bigint(),
}));

export const token = onchainTable("token", (t) => ({
	id: t.text().primaryKey(),
	symbol: t.text().notNull(),
	chainId: t.integer().notNull(),
	address: t.text(),
	createdAt: t.bigint().notNull(),
}));

export const dataFeedToken = onchainTable("data_feed_token", (t) => ({
	id: t.text().primaryKey(),
	dataFeedId: t.text().notNull(),
	tokenId: t.text().notNull(),
	position: t.integer().notNull(), // 0 for base token, 1 for quote token
}));

export const dataFeedRelations = relations(dataFeed, ({ many }) => ({
	dataFeedTokens: many(dataFeedToken),
}));

export const tokenRelations = relations(token, ({ many }) => ({
	dataFeedTokens: many(dataFeedToken),
}));

export const dataFeedTokenRelations = relations(dataFeedToken, ({ one }) => ({
	dataFeed: one(dataFeed, {
		fields: [dataFeedToken.dataFeedId],
		references: [dataFeed.id],
	}),
	token: one(token, {
		fields: [dataFeedToken.tokenId],
		references: [token.id],
	}),
}));

// Aggregator table - created when processing flags, referenced by price updates
export const aggregator = onchainTable("aggregator", (t) => ({
	id: t.text().primaryKey(), // chainId-aggregatorAddress
	address: t.text().notNull(),
	dataFeedId: t.text().notNull(), // Reference to the data feed
	chainId: t.integer().notNull(),
	description: t.text(),
	decimals: t.integer(),
	status: t.text().notNull().default("active"),
	createdAt: t.bigint().notNull(),
}));

// Aggregator price update events - directly references aggregator table
export const priceUpdate = onchainTable("price_update", (t) => ({
	id: t.text().primaryKey(),
	aggregatorId: t.text().notNull(), // Direct reference to aggregator table
	aggregatorAddress: t.text().notNull(), // Kept for convenience
	chainId: t.integer().notNull(),
	roundId: t.bigint().notNull(),
	price: t.text().notNull(), // Raw price value as string
	formattedPrice: t.text(), // Human-readable price
	decimals: t.integer(),
	updatedAt: t.bigint().notNull(), // From the event
	blockNumber: t.bigint().notNull(),
	blockHash: t.text().notNull(),
	transactionHash: t.text().notNull(),
	logIndex: t.integer().notNull(),
	timestamp: t.bigint().notNull(), // Block timestamp
}));

// New round events - directly references aggregator table
export const newRound = onchainTable("new_round", (t) => ({
	id: t.text().primaryKey(),
	aggregatorId: t.text().notNull(), // Direct reference to aggregator table
	aggregatorAddress: t.text().notNull(), // Kept for convenience
	chainId: t.integer().notNull(),
	roundId: t.bigint().notNull(),
	startedBy: t.text().notNull(),
	startedAt: t.bigint().notNull(),
	blockNumber: t.bigint().notNull(),
	blockHash: t.text().notNull(),
	transactionHash: t.text().notNull(),
	logIndex: t.integer().notNull(),
	timestamp: t.bigint().notNull(), // Block timestamp
}));

export const priceUpdateRelations = relations(priceUpdate, ({ one }) => ({
	aggregator: one(aggregator, {
		fields: [priceUpdate.aggregatorId],
		references: [aggregator.id],
	}),
}));

export const newRoundRelations = relations(newRound, ({ one }) => ({
	aggregator: one(aggregator, {
		fields: [newRound.aggregatorId],
		references: [aggregator.id],
	}),
}));

export const aggregatorRelations = relations(aggregator, ({ one, many }) => ({
	dataFeed: one(dataFeed, {
		fields: [aggregator.dataFeedId],
		references: [dataFeed.id],
	}),
	priceUpdates: many(priceUpdate),
	newRounds: many(newRound),
}));
