import { createClient, eq } from "@ponder/client";
import * as schema from "../ponder.schema";
import type { AggregatorInfo } from "./types";

export class AggregatorDiscovery {
	private discoveredAggregators = new Map<string, AggregatorInfo>();

	/**
	 * Discover aggregators from the flags database via SQL API
	 */
	async discoverFromDatabase(
		apiUrl: string = "http://localhost:42069",
	): Promise<AggregatorInfo[]> {
		try {
			console.log("🔍 Discovering aggregators from database via SQL...");

			// Create SQL client
			const client = createClient(`${apiUrl}/sql`, { schema });

			// Query all active data feeds using Drizzle
			const activeFeeds = await client.db
				.select({
					id: schema.dataFeed.id,
					address: schema.dataFeed.address,
					aggregatorAddress: schema.dataFeed.aggregatorAddress,
					description: schema.dataFeed.description,
					chainId: schema.dataFeed.chainId,
					status: schema.dataFeed.status,
				})
				.from(schema.dataFeed)
				.where(eq(schema.dataFeed.status, "active"));

			console.log(`📊 Found ${activeFeeds.length} active data feeds`);

			const aggregators: AggregatorInfo[] = [];
			const chainIdToName = this.getChainIdToNameMapping();

			for (const feed of activeFeeds) {
				const chainName = chainIdToName[feed.chainId];
				if (!chainName) {
					console.warn(`⚠️ Unknown chain ID: ${feed.chainId}`);
					continue;
				}

				// Skip feeds without aggregator address
				if (!feed.aggregatorAddress) {
					console.warn(
						`⚠️ No aggregator address for data feed ${feed.address} on chain ${feed.chainId}`,
					);
					continue;
				}

				const aggregatorInfo: AggregatorInfo = {
					address: feed.aggregatorAddress, // Use aggregator address, not data feed address
					description: feed.description,
					chainId: feed.chainId,
					chainName,
					status: "active",
					discoveredAt: Date.now(),
				};

				const key = `${feed.chainId}-${feed.aggregatorAddress}`;
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
				"💡 Make sure ponder is running and the SQL endpoint is accessible",
			);
			return [];
		}
	}

	/**
	 * Get aggregators for specific chains
	 */
	getAggregatorsForChains(chainNames: string[]): AggregatorInfo[] {
		return Array.from(this.discoveredAggregators.values()).filter((agg) =>
			chainNames.includes(agg.chainName),
		);
	}

	/**
	 * Get aggregators for a specific chain
	 */
	getAggregatorsForChain(chainName: string): AggregatorInfo[] {
		return Array.from(this.discoveredAggregators.values()).filter(
			(agg) => agg.chainName === chainName,
		);
	}

	/**
	 * Get all discovered aggregators
	 */
	getAllAggregators(): AggregatorInfo[] {
		return Array.from(this.discoveredAggregators.values());
	}

	/**
	 * Check if we have aggregators for a chain
	 */
	hasAggregatorsForChain(chainName: string): boolean {
		return this.getAggregatorsForChain(chainName).length > 0;
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
	 * Add a newly discovered aggregator
	 */
	addAggregator(aggregator: AggregatorInfo): void {
		const key = `${aggregator.chainId}-${aggregator.address}`;
		this.discoveredAggregators.set(key, aggregator);
		console.log(
			`➕ Added aggregator: ${aggregator.description} on ${aggregator.chainName}`,
		);
	}

	/**
	 * Remove an aggregator (when flagged)
	 */
	removeAggregator(chainId: number, address: string): void {
		const key = `${chainId}-${address}`;
		const removed = this.discoveredAggregators.delete(key);
		if (removed) {
			console.log(`➖ Removed aggregator: ${address} on chain ${chainId}`);
		}
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
