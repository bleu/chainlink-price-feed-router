import type { AggregatorInfo } from "./types";

export class AggregatorDiscovery {
	private discoveredAggregators = new Map<string, AggregatorInfo>();

	/**
	 * Discover aggregators from the flags database via SQL API
	 */
	async discoverFromDatabase(
		_apiUrl: string = "http://localhost:42069",
		sinceTimestamp?: Date,
	): Promise<AggregatorInfo[]> {
		try {
			console.log(
				"🔍 Discovering aggregators from flags database via direct database connection...",
			);

			// Connect directly to the database instead of using the API
			const { Client } = await import("pg");
			const client = new Client({
				connectionString:
					process.env.DATABASE_URL ||
					"postgresql://postgres:postgres@localhost:5432/postgres",
			});

			await client.connect();

			let sqlQuery = `
				SELECT 
					id,
					address,
					aggregator_address,
					description,
					chain_id,
					status,
					ignored,
					created_at
				FROM chainlink_registry_flags.data_feed 
				WHERE status = 'active' 
				AND ignored = false 
				AND aggregator_address IS NOT NULL
			`;

			// If we have a timestamp, only get aggregators created after that time
			if (sinceTimestamp) {
				sqlQuery += ` AND created_at > $1`;
				console.log(
					`🔍 Looking for aggregators created after ${sinceTimestamp.toISOString()}`,
				);
			}

			const result = sinceTimestamp
				? await client.query(sqlQuery, [sinceTimestamp.getTime()])
				: await client.query(sqlQuery);
			await client.end();

			const activeFeeds = result.rows || [];

			if (sinceTimestamp) {
				console.log(
					`📊 Found ${activeFeeds.length} new data feeds since ${sinceTimestamp.toISOString()}`,
				);
			} else {
				console.log(
					`📊 Found ${activeFeeds.length} active, non-ignored data feeds`,
				);
			}

			const aggregators: AggregatorInfo[] = [];
			const chainIdToName = this.getChainIdToNameMapping();

			for (const feed of activeFeeds) {
				const chainName = chainIdToName[feed.chain_id];
				if (!chainName) {
					console.warn(`⚠️ Unknown chain ID: ${feed.chain_id}`);
					continue;
				}

				// Skip feeds without aggregator address (already filtered in SQL)
				if (!feed.aggregator_address) {
					console.warn(
						`⚠️ No aggregator address for data feed ${feed.address} on chain ${feed.chain_id}`,
					);
					continue;
				}

				const aggregatorInfo: AggregatorInfo = {
					address: feed.aggregator_address, // Use aggregator address, not data feed address
					description: feed.description,
					chainId: feed.chain_id,
					chainName,
					status: "active",
					discoveredAt: Date.now(),
				};

				const key = `${feed.chain_id}-${feed.aggregator_address}`;
				this.discoveredAggregators.set(key, aggregatorInfo);
				aggregators.push(aggregatorInfo);
			}

			console.log(
				`✅ Discovered ${aggregators.length} aggregators across ${new Set(aggregators.map((a) => a.chainName)).size} chains`,
			);

			// Log summary by chain
			const byChain = aggregators.reduce(
				(acc, agg) => {
					acc[agg.chainName] = (acc[agg.chainName] || 0) + 1;
					return acc;
				},
				{} as Record<string, number>,
			);

			for (const [chain, count] of Object.entries(byChain)) {
				console.log(`  ${chain}: ${count} aggregators`);
			}

			return aggregators;
		} catch (error) {
			console.error("❌ Failed to discover aggregators from database:", error);
			console.log(
				"💡 Make sure flags indexer is running and the SQL endpoint is accessible",
			);
			return [];
		}
	}

	/**
	 * Get all discovered aggregators
	 */
	getAllAggregators(): AggregatorInfo[] {
		return Array.from(this.discoveredAggregators.values());
	}

	/**
	 * Get unique chain names that have aggregators
	 */
	getChainsWithAggregators(): string[] {
		const chains = new Set<string>();
		for (const agg of this.discoveredAggregators.values()) {
			chains.add(agg.chainName);
		}
		return Array.from(chains);
	}

	/**
	 * Get statistics about discovered aggregators
	 */
	getStats(): {
		total: number;
		byChain: Record<string, number>;
		byStatus: Record<string, number>;
	} {
		const aggregators = this.getAllAggregators();

		const byChain = aggregators.reduce(
			(acc, agg) => {
				acc[agg.chainName] = (acc[agg.chainName] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		const byStatus = aggregators.reduce(
			(acc, agg) => {
				acc[agg.status] = (acc[agg.status] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		return {
			total: aggregators.length,
			byChain,
			byStatus,
		};
	}

	/**
	 * Clear all discovered aggregators
	 */
	clear(): void {
		this.discoveredAggregators.clear();
		console.log("🧹 Cleared all discovered aggregators");
	}

	/**
	 * Map chain IDs to chain names (from ponder config)
	 */
	private getChainIdToNameMapping(): Record<number, string> {
		return {
			1: "ethereum",
			10: "optimism",
			100: "gnosis",
			130: "unichain",
			137: "polygon",
			146: "sonic",
			324: "zksync",
			1868: "soneium",
			5000: "mantle",
			8453: "base",
			42161: "arbitrum",
			42220: "celo",
			43114: "avalanche",
			57073: "ink",
			59144: "linea",
			60808: "bob",
			534352: "scroll",
		};
	}
}
