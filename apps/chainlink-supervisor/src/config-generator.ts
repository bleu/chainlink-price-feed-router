import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { AggregatorInfo } from "./types";

export class ConfigGenerator {
	private aggregatorsConfigPath: string;

	constructor(aggregatorsAppPath: string) {
		this.aggregatorsConfigPath = path.join(
			aggregatorsAppPath,
			"ponder.config.ts",
		);
	}

	/**
	 * Get the last config generation timestamp from the config file
	 */
	async getLastConfigGeneration(): Promise<Date | null> {
		try {
			const config = await fs.readFile(this.aggregatorsConfigPath, "utf8");
			const timestampMatch = config.match(/\/\/ Generated at: (.+)/);
			if (timestampMatch) {
				return new Date(timestampMatch[1]);
			}
		} catch (_error) {
			// Config file doesn't exist or can't be read
		}
		return null;
	}

	/**
	 * Update aggregator config with discovered aggregators
	 */
	async updateAggregatorConfig(aggregators: AggregatorInfo[]): Promise<string> {
		console.log(
			`🔧 Updating aggregator config with ${aggregators.length} aggregators...`,
		);

		// Group aggregators by chain
		const aggregatorsByChain = this.groupAggregatorsByChain(aggregators);

		console.log(`📊 Aggregators grouped by chain:`);
		for (const [chainName, chainAggregators] of Object.entries(
			aggregatorsByChain,
		)) {
			console.log(`  ${chainName}: ${chainAggregators.length} aggregators`);
		}

		// Read the current config
		const currentConfig = await fs.readFile(this.aggregatorsConfigPath, "utf8");

		// Generate the new config with aggregators
		const newConfig = this.buildConfigWithAggregators(
			currentConfig,
			aggregatorsByChain,
		);

		// Write the updated config
		await fs.writeFile(this.aggregatorsConfigPath, newConfig, "utf8");

		console.log(`✅ Updated aggregator config: ${this.aggregatorsConfigPath}`);
		return this.aggregatorsConfigPath;
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
	 * Build the new config with aggregator contracts
	 */
	private buildConfigWithAggregators(
		originalConfig: string,
		aggregatorsByChain: Record<string, AggregatorInfo[]>,
	): string {
		// Generate the aggregator contracts section
		const aggregatorContracts =
			this.generateAggregatorContracts(aggregatorsByChain);

		// Find the start and end of the AccessControlledOffchainAggregator section
		const startPattern = /AccessControlledOffchainAggregator: \{/;
		const startMatch = originalConfig.match(startPattern);

		if (!startMatch) {
			throw new Error(
				"Could not find AccessControlledOffchainAggregator section in config",
			);
		}

		const startIndex = startMatch.index!;

		// Find the matching closing brace by counting braces
		let braceCount = 0;
		let endIndex = startIndex;
		let inString = false;
		let escapeNext = false;

		for (let i = startIndex; i < originalConfig.length; i++) {
			const char = originalConfig[i];

			if (escapeNext) {
				escapeNext = false;
				continue;
			}

			if (char === "\\") {
				escapeNext = true;
				continue;
			}

			if (char === '"' || char === "'" || char === "`") {
				inString = !inString;
				continue;
			}

			if (!inString) {
				if (char === "{") {
					braceCount++;
				} else if (char === "}") {
					braceCount--;
					if (braceCount === 0) {
						endIndex = i + 1;
						break;
					}
				}
			}
		}

		// Replace the entire AccessControlledOffchainAggregator section
		const beforeSection = originalConfig.substring(0, startIndex);
		const afterSection = originalConfig.substring(endIndex);

		const timestamp = new Date().toISOString();
		const newSection = `AccessControlledOffchainAggregator: {
			// Generated at: ${timestamp}
			abi: AccessControlledOffchainAggregatorAbi,
			chain: {
${aggregatorContracts}
			},
		}`;

		return beforeSection + newSection + afterSection;
	}

	/**
	 * Generate aggregator contract configurations with deterministic ordering
	 */
	private generateAggregatorContracts(
		aggregatorsByChain: Record<string, AggregatorInfo[]>,
	): string {
		const contracts: string[] = [];

		// Sort chains alphabetically for deterministic output
		const sortedChainNames = Object.keys(aggregatorsByChain).sort();

		for (const chainName of sortedChainNames) {
			const aggregators = aggregatorsByChain[chainName];
			if (!aggregators || aggregators.length === 0) continue;

			// Sort aggregator addresses alphabetically for deterministic output
			const sortedAddresses = aggregators
				.map((agg) => agg.address)
				.sort()
				.map((address) => `\t\t\t\t\t"${address}"`)
				.join(",\n");

			const startBlock = this.getStartBlockForChain(chainName);

			contracts.push(`\t\t\t\t${chainName}: {
\t\t\t\t\taddress: [
${sortedAddresses}
\t\t\t\t\t],
\t\t\t\t\tstartBlock: ${startBlock},
\t\t\t\t},`);
		}

		return contracts.join("\n");
	}

	/**
	 * Get appropriate start block for each chain
	 */
	private getStartBlockForChain(chainName: string): number {
		// Use the same start blocks as the flags contracts
		const startBlocks: Record<string, number> = {
			ethereum: 22031347,
			arbitrum: 314969848,
			avalanche: 58621332,
			base: 27544881,
			bob: 14513762,
			celo: 30842796,
			gnosis: 39015359,
			ink: 8390783,
			linea: 16897214,
			mantle: 76879554,
			optimism: 133140417,
			polygon: 69003366,
			scroll: 14009465,
			soneium: 4377309,
			sonic: 13503074,
			unichain: 11140474,
			zksync: 57665872,
		};

		return startBlocks[chainName] || 1000000;
	}

	/**
	 * Backup the current config
	 */
	async backupCurrentConfig(): Promise<string> {
		const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
		const backupPath = this.aggregatorsConfigPath.replace(
			".ts",
			`.backup.${timestamp}.ts`,
		);

		try {
			const currentConfig = await fs.readFile(
				this.aggregatorsConfigPath,
				"utf8",
			);
			await fs.writeFile(backupPath, currentConfig, "utf8");
			console.log(`📁 Backed up current config to: ${backupPath}`);
			return backupPath;
		} catch (error) {
			console.error("⚠️ Failed to backup current config:", error);
			throw error;
		}
	}

	/**
	 * Validate that the generated config is syntactically correct
	 */
	async validateGeneratedConfig(): Promise<boolean> {
		try {
			const configContent = await fs.readFile(
				this.aggregatorsConfigPath,
				"utf8",
			);

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
	 * Format the generated config with biome
	 */
	async formatGeneratedConfig(): Promise<boolean> {
		try {
			console.log("🎨 Formatting generated config with biome...");

			const aggregatorsAppDir = path.dirname(this.aggregatorsConfigPath);

			// Run biome format on the config file
			await new Promise<void>((resolve, reject) => {
				const biome = spawn(
					"pnpm",
					["biome", "format", "--write", "ponder.config.ts"],
					{
						cwd: aggregatorsAppDir,
						stdio: "inherit",
					},
				);

				biome.on("close", (code) => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`Biome format failed with exit code ${code}`));
					}
				});

				biome.on("error", (error) => {
					reject(error);
				});
			});

			console.log("✅ Config formatted successfully with biome");
			return true;
		} catch (error) {
			console.error("⚠️ Failed to format config with biome:", error);
			console.log(
				"💡 Config was generated but not formatted - you can run biome manually",
			);
			return false;
		}
	}
}
