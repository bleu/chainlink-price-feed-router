import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { AggregatorInfo } from "./types";

export class ConfigGenerator {
	private projectRoot: string;
	private originalConfigPath: string;
	private generatedSchemaName?: string;

	constructor(projectRoot: string) {
		this.projectRoot = projectRoot;
		this.originalConfigPath = path.join(projectRoot, "ponder.config.ts");
	}

	/**
	 * Generate a new ponder config with aggregator contracts
	 */
	async generateConfig(aggregators: AggregatorInfo[]): Promise<string> {
		console.log(
			`🔧 Generating ponder config with ${aggregators.length} aggregators...`,
		);

		// Group aggregators by chain
		const aggregatorsByChain = this.groupAggregatorsByChain(aggregators);

		console.log(`📊 Aggregators grouped by chain:`);
		for (const [chainName, chainAggregators] of Object.entries(
			aggregatorsByChain,
		)) {
			console.log(`  ${chainName}: ${chainAggregators.length} aggregators`);
			// Log first few addresses for debugging
			const sampleAddresses = chainAggregators
				.slice(0, 3)
				.map((a) => a.address);
			console.log(`    Sample addresses: ${sampleAddresses.join(", ")}`);
		}

		// Read the original config template
		const originalConfig = await this.readOriginalConfig();
		console.log(
			`📄 Original config length: ${originalConfig.length} characters`,
		);

		// Generate the new config
		const newConfig = this.buildConfigWithAggregators(
			originalConfig,
			aggregatorsByChain,
		);
		console.log(`📄 New config length: ${newConfig.length} characters`);

		// Write the generated config
		await fs.writeFile(this.originalConfigPath, newConfig, "utf8");

		console.log(`✅ Generated config written to: ${this.originalConfigPath}`);

		return this.originalConfigPath;
	}

	/**
	 * Group aggregators by chain name
	 */
	private groupAggregatorsByChain(
		aggregators: AggregatorInfo[],
	): Record<string, AggregatorInfo[]> {
		return aggregators.reduce(
			(acc, agg) => {
				if (!acc[agg.chainName]) {
					acc[agg.chainName] = [];
				}
				acc[agg.chainName]?.push(agg);
				return acc;
			},
			{} as Record<string, AggregatorInfo[]>,
		);
	}

	/**
	 * Read the original config file
	 */
	private async readOriginalConfig(): Promise<string> {
		try {
			return await fs.readFile(this.originalConfigPath, "utf8");
		} catch (error) {
			throw new Error(`Failed to read original config: ${error}`);
		}
	}

	/**
	 * Build the new config with aggregator contracts
	 */
	private buildConfigWithAggregators(
		originalConfig: string,
		aggregatorsByChain: Record<string, AggregatorInfo[]>,
	): string {
		// Generate a deterministic schema name based on the aggregator addresses
		const schemaName = this.generateSchemaName(aggregatorsByChain);
		console.log(`🏷️ Using schema: ${schemaName}`);

		// Store the schema name for later use when activating the config
		this.generatedSchemaName = schemaName;

		// Generate the aggregator contracts section
		const aggregatorContracts =
			this.generateAggregatorContracts(aggregatorsByChain);

		// Check if AccessControlledOffchainAggregator already exists
		const hasAggregatorSection = originalConfig.includes(
			"AccessControlledOffchainAggregator: {",
		);

		let newConfig: string;

		if (hasAggregatorSection) {
			// Replace the existing AccessControlledOffchainAggregator section
			const aggregatorSectionStart = originalConfig.indexOf(
				"AccessControlledOffchainAggregator: {",
			);
			const aggregatorSectionEnd = originalConfig.indexOf(
				"\t\t},\n\t},\n});",
				aggregatorSectionStart,
			);

			if (aggregatorSectionEnd === -1) {
				throw new Error(
					"Could not find end of AccessControlledOffchainAggregator section",
				);
			}

			const beforeSection = originalConfig.substring(0, aggregatorSectionStart);
			const afterSection = originalConfig.substring(aggregatorSectionEnd);

			newConfig = `${beforeSection}AccessControlledOffchainAggregator: {
			abi: AccessControlledOffchainAggregatorAbi,
			chain: {
${aggregatorContracts}
			},
		${afterSection}`;
		} else {
			// Add new AccessControlledOffchainAggregator section
			const { imports, baseConfig } =
				this.extractConfigTemplate(originalConfig);

			newConfig = `${imports}

${baseConfig},
		AccessControlledOffchainAggregator: {
			abi: AccessControlledOffchainAggregatorAbi,
			chain: {
${aggregatorContracts}
			},
		},
	},
});`;
		}

		return newConfig;
	}

	/**
	 * Extract the template parts from the original config
	 */
	private extractConfigTemplate(originalConfig: string): {
		imports: string;
		baseConfig: string;
	} {
		// Add the aggregator ABI import
		const imports = `import { createConfig } from "ponder";

import { ChainLinkDataFeedFlagsAbi } from "./abis/ChainLinkDataFeedFlagsAbi";
import { AccessControlledOffchainAggregatorAbi } from "./abis/AccessControlledOffchainAggregatorAbi";`;

		// Extract everything up to the contracts section
		const configStart = originalConfig.indexOf("export default createConfig({");
		const contractsStart = originalConfig.indexOf("contracts: {");

		// Look for the end of the ChainLinkDataFeedFlags contract specifically
		const flagsContractStart = originalConfig.indexOf(
			"ChainLinkDataFeedFlags: {",
		);
		const flagsContractEndPattern =
			/\t\t},\s*(?=\t\tAccessControlledOffchainAggregator|\t},)/;
		const flagsContractEndMatch = originalConfig
			.substring(flagsContractStart)
			.match(flagsContractEndPattern);
		const flagsContractEnd = flagsContractEndMatch
			? flagsContractStart +
				originalConfig
					.substring(flagsContractStart)
					.indexOf(flagsContractEndMatch[0]) +
				flagsContractEndMatch[0].length -
				1
			: originalConfig.indexOf("\t\t},", flagsContractStart);

		if (
			configStart === -1 ||
			contractsStart === -1 ||
			flagsContractEnd === -1
		) {
			console.error("Config parsing failed:");
			console.error(`  configStart: ${configStart}`);
			console.error(`  contractsStart: ${contractsStart}`);
			console.error(`  flagsContractStart: ${flagsContractStart}`);
			console.error(`  flagsContractEnd: ${flagsContractEnd}`);
			console.error("  Config end snippet:", originalConfig.slice(-200));
			throw new Error("Could not parse original config structure");
		}

		// Get the base config (chains + flags contract only)
		const baseConfig = originalConfig.substring(configStart, flagsContractEnd);

		return { imports, baseConfig };
	}

	/**
	 * Generate aggregator contract configurations
	 */
	private generateAggregatorContracts(
		aggregatorsByChain: Record<string, AggregatorInfo[]>,
	): string {
		const contracts: string[] = [];

		for (const [chainName, aggregators] of Object.entries(aggregatorsByChain)) {
			if (aggregators.length === 0) continue;

			const addresses = aggregators
				.map((agg) => `\t\t\t\t\t"${agg.address}"`)
				.join(",\n");
			const startBlock = this.getStartBlockForChain(chainName);

			contracts.push(`\t\t\t\t${chainName}: {
\t\t\t\t\taddress: [
${addresses}
\t\t\t\t\t],
\t\t\t\t\tstartBlock: ${startBlock},
\t\t\t\t},`);
		}

		return contracts.join("\n");
	}

	/**
	 * Get appropriate start block for each chain by reading from flags config
	 */
	private getStartBlockForChain(chainName: string): number {
		try {
			// Read the current config to extract flags start blocks
			const configContent = readFileSync(this.originalConfigPath, "utf8");

			// Look for the chain's flags configuration
			const chainPattern = new RegExp(
				`${chainName}:\\s*{[^}]*startBlock:\\s*(\\d+)`,
				"i",
			);
			const match = configContent.match(chainPattern);

			if (match) {
				return Number(match[1]);
			}

			console.warn(
				`Could not find flags start block for ${chainName}, using default 1000000`,
			);
			return 1000000;
		} catch (error) {
			console.warn(`Error reading start block for ${chainName}:`, error);
			return 1000000;
		}
	}

	/**
	 * Backup the current config
	 */
	async backupCurrentConfig(): Promise<string> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupPath = path.join(
			this.projectRoot,
			`ponder.config.backup.${timestamp}.ts`,
		);

		try {
			const currentConfig = await fs.readFile(this.originalConfigPath, "utf8");
			await fs.writeFile(backupPath, currentConfig, "utf8");
			console.log(`📁 Backed up current config to: ${backupPath}`);
			return backupPath;
		} catch (error) {
			console.error("⚠️ Failed to backup current config:", error);
			throw error;
		}
	}

	/**
	 * Replace the current config with the generated one
	 */
	async activateGeneratedConfig(): Promise<void> {
		try {
			// First backup the current config
			await this.backupCurrentConfig();

			// Set the database schema environment variable for the new config
			if (this.generatedSchemaName) {
				process.env.DATABASE_SCHEMA = this.generatedSchemaName;
				console.log(`🏷️ Set DATABASE_SCHEMA to: ${this.generatedSchemaName}`);
			}

			// Copy generated config to main config
			const generatedConfig = await fs.readFile(
				this.originalConfigPath,
				"utf8",
			);
			await fs.writeFile(this.originalConfigPath, generatedConfig, "utf8");

			console.log("✅ Activated generated config");
		} catch (error) {
			console.error("❌ Failed to activate generated config:", error);
			throw error;
		}
	}

	/**
	 * Validate that the generated config is syntactically correct
	 */
	async validateGeneratedConfig(): Promise<boolean> {
		try {
			const configContent = await fs.readFile(this.originalConfigPath, "utf8");

			// Basic syntax checks
			if (!configContent.includes("export default createConfig({")) {
				throw new Error("Missing export default createConfig");
			}

			if (!configContent.includes("AccessControlledOffchainAggregatorAbi")) {
				throw new Error("Missing aggregator ABI import");
			}

			// Count braces to ensure they're balanced
			const openBraces = (configContent.match(/{/g) || []).length;
			const closeBraces = (configContent.match(/}/g) || []).length;

			if (openBraces !== closeBraces) {
				throw new Error(
					`Unbalanced braces: ${openBraces} open, ${closeBraces} close`,
				);
			}

			console.log("✅ Generated config validation passed");
			return true;
		} catch (error) {
			console.error("❌ Generated config validation failed:", error);
			return false;
		}
	}

	/**
	 * Generate a unique schema name based on aggregator configuration and timestamp
	 */
	private generateSchemaName(
		aggregatorsByChain: Record<string, AggregatorInfo[]>,
	): string {
		// Create a deterministic string from the aggregator configuration
		const configString = Object.entries(aggregatorsByChain)
			.sort(([a], [b]) => a.localeCompare(b)) // Sort by chain name for consistency
			.map(([chainName, aggregators]) => {
				const sortedAddresses = aggregators
					.map((agg) => agg.address.toLowerCase())
					.sort(); // Sort addresses for consistency
				return `${chainName}:${sortedAddresses.join(",")}`;
			})
			.join("|");

		// Add timestamp to ensure uniqueness (avoid schema conflicts)
		const timestamp = Date.now();
		const hashInput = `${configString}_${timestamp}`;

		// Generate a hash of the configuration + timestamp
		const hash = crypto.createHash("sha256").update(hashInput).digest("hex");
		const shortHash = hash.substring(0, 8); // Use first 8 characters

		// Create a readable schema name with timestamp
		const totalAggregators = Object.values(aggregatorsByChain).reduce(
			(sum, aggs) => sum + aggs.length,
			0,
		);
		const chainCount = Object.keys(aggregatorsByChain).length;

		return `chainlink_agg_${chainCount}c_${totalAggregators}a_${shortHash}`;
	}

	/**
	 * Get the generated schema name
	 */
	getGeneratedSchemaName(): string | undefined {
		return this.generatedSchemaName;
	}

	/**
	 * Get statistics about the generated config
	 */
	async getConfigStats(): Promise<{
		totalAggregators: number;
		chainCount: number;
		configSize: number;
	}> {
		try {
			const configContent = await fs.readFile(this.originalConfigPath, "utf8");
			const aggregatorMatches = configContent.match(/0x[a-fA-F0-9]{40}/g) || [];
			const chainMatches = configContent.match(/chain: "[^"]+"/g) || [];

			return {
				totalAggregators: aggregatorMatches.length,
				chainCount: new Set(chainMatches).size,
				configSize: configContent.length,
			};
		} catch (error) {
			console.error("Failed to get config stats:", error);
			return { totalAggregators: 0, chainCount: 0, configSize: 0 };
		}
	}
}
