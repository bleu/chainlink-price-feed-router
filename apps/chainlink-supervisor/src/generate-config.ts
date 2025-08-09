#!/usr/bin/env node

import path from "node:path";
import { AggregatorDiscovery } from "./aggregator-discovery";
import { ConfigGenerator } from "./config-generator";

/**
 * Standalone script to generate aggregators config from flags data
 */
async function generateAggregatorsConfig() {
	console.log("🚀 Generating aggregators config from flags data...");

	const flagsApiUrl = process.env.FLAGS_API_URL || "http://localhost:42069";
	const aggregatorsAppPath = path.resolve(
		process.cwd(),
		"../chainlink-aggregators-indexer",
	);

	console.log(`📍 Flags API: ${flagsApiUrl}`);
	console.log(`📍 Aggregators app: ${aggregatorsAppPath}`);

	try {
		// Initialize discovery and config generator
		const discovery = new AggregatorDiscovery();
		const configGenerator = new ConfigGenerator(aggregatorsAppPath);

		// Discover aggregators from flags database
		console.log("\n🔍 Discovering aggregators from flags database...");
		const aggregators = await discovery.discoverFromDatabase(flagsApiUrl);

		if (aggregators.length === 0) {
			console.log("⚠️ No aggregators discovered. Make sure:");
			console.log("  1. Flags indexer is running and synced");
			console.log("  2. Flags API is accessible at", flagsApiUrl);
			console.log("  3. Database contains active, non-ignored data feeds");
			return;
		}

		console.log(`\n✅ Discovered ${aggregators.length} aggregators`);

		// Show summary by chain
		const byChain = aggregators.reduce(
			(acc, agg) => {
				acc[agg.chainName] = (acc[agg.chainName] || 0) + 1;
				return acc;
			},
			{} as Record<string, number>,
		);

		console.log("\n📊 Aggregators by chain:");
		for (const [chain, count] of Object.entries(byChain)) {
			console.log(`  ${chain}: ${count} aggregators`);
		}

		// Backup current config
		console.log("\n📁 Backing up current config...");
		await configGenerator.backupCurrentConfig();

		// Generate new config
		console.log("\n🔧 Generating new aggregators config...");
		const configPath =
			await configGenerator.updateAggregatorConfig(aggregators);

		// Validate generated config
		console.log("\n✅ Validating generated config...");
		const isValid = await configGenerator.validateGeneratedConfig();

		if (!isValid) {
			console.error("\n❌ Generated config validation failed!");
			console.log("💡 Check the backup file and try again");
			return;
		}

		// Format the generated config with biome
		console.log("\n🎨 Formatting generated config...");
		await configGenerator.formatGeneratedConfig();

		console.log("\n🎉 Successfully generated aggregators config!");
		console.log(`📄 Config file: ${configPath}`);
		console.log(`📊 Total aggregators: ${aggregators.length}`);
		console.log(`🌐 Chains covered: ${Object.keys(byChain).length}`);

		// Show deterministic ordering info
		const sortedChains = Object.keys(byChain).sort();
		console.log(
			`🔄 Chains ordered deterministically: ${sortedChains.join(", ")}`,
		);

		console.log("\n💡 Next steps:");
		console.log("  1. Review the generated config");
		console.log(
			"  2. Start the aggregators indexer: cd ../chainlink-aggregators-indexer && pnpm dev",
		);
	} catch (error) {
		console.error("\n❌ Failed to generate aggregators config:", error);
		console.log("\n💡 Troubleshooting:");
		console.log("  1. Ensure flags indexer is running and accessible");
		console.log("  2. Check database connectivity");
		console.log("  3. Verify aggregators app path exists");
		process.exit(1);
	}
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	generateAggregatorsConfig().catch(console.error);
}

export { generateAggregatorsConfig };
