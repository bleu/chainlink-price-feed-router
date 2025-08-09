#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { AggregatorDiscovery } from "./aggregator-discovery";
import { ConfigGenerator } from "./config-generator";
import { ProcessManager } from "./process-manager";
import type { SupervisorConfig } from "./types";

export class ChainlinkSupervisor {
	private discovery: AggregatorDiscovery;
	private configGenerator: ConfigGenerator;
	private flagsProcessManager: ProcessManager;
	private aggregatorsProcessManager: ProcessManager;
	private config: SupervisorConfig;
	private isRunning = false;
	private cleanupFunctions: (() => void)[] = [];
	private discoveryInterval: NodeJS.Timeout | null = null;
	private aggregatorsAppPath: string;

	constructor(config: SupervisorConfig) {
		this.config = config;
		this.discovery = new AggregatorDiscovery();

		// Get paths to the indexer apps
		const flagsAppPath = path.resolve(
			process.cwd(),
			"../chainlink-flags-indexer",
		);
		this.aggregatorsAppPath = path.resolve(
			process.cwd(),
			"../chainlink-aggregators-indexer",
		);

		this.configGenerator = new ConfigGenerator(this.aggregatorsAppPath);
		this.flagsProcessManager = new ProcessManager(flagsAppPath, "flags");
		this.aggregatorsProcessManager = new ProcessManager(
			this.aggregatorsAppPath,
			"aggregators",
		);
	}

	/**
	 * Start the supervisor
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			console.log("⚠️ Chainlink Supervisor is already running");
			return;
		}

		console.log("🚀 Starting Chainlink Registry Supervisor...");
		console.log(`📍 Supervisor root: ${process.cwd()}`);
		console.log(`🏁 Flags API: ${this.config.flagsApiUrl}`);
		console.log(`📊 Aggregators API: ${this.config.aggregatorsApiUrl}`);
		console.log(`⏱️ Discovery interval: ${this.config.checkInterval}ms`);

		this.isRunning = true;

		try {
			// Phase 1: Start flags indexer and wait for complete sync
			console.log("\n🏁 Phase 1: Starting flags indexer...");
			await this.startFlagsProcess();

			console.log("\n⏳ Waiting for flags indexer to complete sync...");
			await this.waitForFlagsSync();

			// Phase 2: Run aggregator discovery with complete flags data
			console.log("\n🔍 Phase 2: Running aggregator discovery...");
			const aggregators = await this.runAggregatorDiscovery();

			// Phase 3: Start aggregators indexer with discovered config
			console.log("\n📊 Phase 3: Starting aggregators indexer...");
			await this.startAggregatorsProcess(aggregators);

			// Phase 4: Start ongoing monitoring
			console.log("\n🏥 Phase 4: Starting ongoing monitoring...");
			this.startHealthMonitoring();
			this.startDiscoveryPolling();

			console.log("\n✅ Chainlink Supervisor started successfully!");
			console.log(
				`📊 Monitoring ${aggregators.length} aggregators across chains`,
			);
		} catch (error) {
			console.error("❌ Failed to start supervisor:", error);
			await this.stop();
			throw error;
		}
	}

	/**
	 * Start the flags process
	 */
	private async startFlagsProcess(): Promise<void> {
		console.log("🚀 Starting flags indexer process...");

		const indexerStarted = await this.flagsProcessManager.startIndexer();
		if (!indexerStarted) {
			throw new Error("Failed to start flags indexer");
		}

		console.log("✅ Flags process started (indexer + server)");
	}

	/**
	 * Wait for flags indexer to complete initial sync
	 */
	private async waitForFlagsSync(): Promise<void> {
		console.log("🔍 Waiting for flags indexer to become available...");

		const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
		const startTime = Date.now();

		// First wait for API to be available
		while (Date.now() - startTime < maxWaitTime) {
			try {
				const response = await fetch(`${this.config.flagsApiUrl}/health`);
				if (response.ok) {
					console.log("✅ Flags indexer API is available");
					break;
				}
			} catch (_error) {
				// API not ready yet
			}

			console.log("⏳ Waiting for flags indexer API...");
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}

		if (Date.now() - startTime >= maxWaitTime) {
			throw new Error(
				"Flags indexer API failed to become available within timeout",
			);
		}
	}

	/**
	 * Run aggregator discovery against synced flags database
	 */
	private async runAggregatorDiscovery(): Promise<any[]> {
		console.log("🔍 Discovering aggregators from synced flags database...");

		// Wait for flags indexer to be completely ready
		await this.waitForFlagsIndexerReady();

		try {
			// Discover all aggregators
			const aggregators = await this.discovery.discoverFromDatabase(
				this.config.flagsApiUrl,
			);

			console.log(
				`✅ Discovered ${aggregators.length} aggregators across ${this.discovery.getChainsWithAggregators().length} chains`,
			);

			return aggregators;
		} catch (error) {
			console.error("❌ Aggregator discovery failed:", error);
			throw error; // Don't proceed with empty config
		}
	}

	/**
	 * Wait for flags indexer to be completely ready for queries
	 */
	private async waitForFlagsIndexerReady(): Promise<void> {
		console.log(
			"⏳ Waiting for flags indexer to finish processing ALL events...",
		);
		console.log("   (This ensures complete data for aggregator discovery)");

		const maxWaitTime = 10 * 60 * 1000; // 10 minutes max
		const startTime = Date.now();
		const _lastEventCount = 0;
		const _stableCount = 0;

		while (Date.now() - startTime < maxWaitTime) {
			try {
				const readyResponse = await fetch(`${this.config.flagsApiUrl}/ready`);
				const readyText = await readyResponse.text();

				if (!readyText.includes("not complete")) {
					console.log("✅ Flags indexer reports ready - all events processed!");
					return;
				}

				// Show progress by checking if we're still seeing new events
				const currentTime = new Date().toLocaleTimeString();
				console.log(
					`⏳ [${currentTime}] Flags indexer still processing events...`,
				);

				await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds
			} catch (_error) {
				console.log(
					"⏳ Flags indexer /ready endpoint not available, waiting...",
				);
				await new Promise((resolve) => setTimeout(resolve, 3000));
			}
		}

		throw new Error(
			"Flags indexer failed to complete processing within 10 minutes",
		);
	}

	/**
	 * Start the aggregators process with discovered aggregators
	 */
	private async startAggregatorsProcess(aggregators: any[]): Promise<void> {
		console.log(
			`🚀 Starting aggregators indexer with ${aggregators.length} aggregators...`,
		);

		// Generate config with discovered aggregators
		await this.generateAggregatorConfig(aggregators);

		const indexerStarted = await this.aggregatorsProcessManager.startIndexer();
		if (!indexerStarted) {
			throw new Error("Failed to start aggregators indexer");
		}

		console.log(
			`✅ Aggregators process started with ${aggregators.length} aggregators`,
		);
	}

	/**
	 * Generate aggregator config with discovered aggregators
	 */
	private async generateAggregatorConfig(aggregators: any[]): Promise<void> {
		console.log(
			`🔧 Generating aggregator config with ${aggregators.length} aggregators...`,
		);

		try {
			// Check if the config already has aggregators configured
			const configPath = path.join(this.aggregatorsAppPath, "ponder.config.ts");
			const currentConfig = await fs.readFile(configPath, "utf8");

			// If config already has addresses and we have no new aggregators, don't overwrite
			if (
				aggregators.length === 0 &&
				currentConfig.includes("address: [") &&
				!currentConfig.includes("address: [\n\t\t\t\t\t\t\t\t\t]")
			) {
				console.log(
					"✅ Aggregator config already has addresses, keeping existing config",
				);
				return;
			}

			// Backup current config before updating
			await this.configGenerator.backupCurrentConfig();

			// Generate new config with discovered aggregators
			await this.configGenerator.updateAggregatorConfig(aggregators);

			// Validate the generated config
			const isValid = await this.configGenerator.validateGeneratedConfig();
			if (!isValid) {
				throw new Error("Generated config validation failed");
			}

			console.log(
				`✅ Aggregator config generated with ${aggregators.length} aggregators`,
			);
		} catch (error) {
			console.error("❌ Failed to generate aggregator config:", error);
			throw error;
		}
	}

	/**
	 * Start polling for new aggregators (ongoing monitoring)
	 */
	private startDiscoveryPolling(): void {
		console.log("🔍 Starting ongoing aggregator discovery polling...");

		const pollForNewAggregators = async () => {
			try {
				// Check if flags indexer is running
				const flagsHealth = this.flagsProcessManager.getHealthStatus();
				if (!flagsHealth.indexer.running) {
					console.log("⏳ Flags indexer not running, skipping discovery...");
					return;
				}

				// Check if flags indexer is ready for queries
				try {
					const readyResponse = await fetch(`${this.config.flagsApiUrl}/ready`);
					const readyText = await readyResponse.text();
					if (readyText.includes("not complete")) {
						console.log("⏳ Flags indexer sync not complete, waiting...");
						return;
					}
				} catch (_error) {
					console.log("⏳ Flags indexer API not ready, waiting...");
					return;
				}

				// Discover aggregators from flags database
				const newAggregators = await this.discovery.discoverFromDatabase(
					this.config.flagsApiUrl,
				);

				const currentAggregators = this.discovery.getAllAggregators();

				if (newAggregators.length > currentAggregators.length) {
					const newCount = newAggregators.length - currentAggregators.length;
					console.log(
						`🆕 Discovered ${newCount} new aggregators! Total: ${newAggregators.length}`,
					);

					// Update config with new aggregators
					await this.updateAggregatorsConfig(newAggregators);
				}
			} catch (error) {
				console.error("❌ Discovery polling failed:", error);
				console.log("⏳ Will retry on next polling cycle...");
			}
		};

		// Set up polling interval (no initial run since we already discovered)
		this.discoveryInterval = setInterval(
			pollForNewAggregators,
			this.config.checkInterval,
		);

		this.cleanupFunctions.push(() => {
			if (this.discoveryInterval) {
				clearInterval(this.discoveryInterval);
				this.discoveryInterval = null;
			}
		});
	}

	/**
	 * Update aggregators process config with new aggregators
	 */
	private async updateAggregatorsConfig(aggregators: any[]): Promise<void> {
		console.log(
			`🔧 Updating aggregators config with ${aggregators.length} aggregators...`,
		);

		try {
			// Backup current config
			await this.configGenerator.backupCurrentConfig();

			// Generate new aggregators config
			const _configPath =
				await this.configGenerator.updateAggregatorConfig(aggregators);

			// Validate the config
			const isValid = await this.configGenerator.validateGeneratedConfig();
			if (!isValid) {
				throw new Error("Generated config validation failed");
			}

			// Restart aggregators process with new config
			console.log("🔄 Restarting aggregators process with new config...");

			const restarted = await this.aggregatorsProcessManager.restartAll();

			if (restarted) {
				console.log("✅ Aggregators process restarted with new config");
			} else {
				console.error("❌ Failed to restart aggregators process");
			}
		} catch (error) {
			console.error("❌ Failed to update aggregators config:", error);
		}
	}

	/**
	 * Start health monitoring for both processes
	 */
	private startHealthMonitoring(): void {
		console.log("🏥 Starting health monitoring...");

		const checkHealth = async () => {
			const flagsHealth = this.flagsProcessManager.getHealthStatus();
			const aggregatorsHealth =
				this.aggregatorsProcessManager.getHealthStatus();

			// Restart flags process if needed
			if (
				!flagsHealth.indexer.running &&
				flagsHealth.indexer.restarts < this.config.maxRetries
			) {
				console.log("⚠️ Flags indexer not running, restarting...");
				await this.flagsProcessManager.restartIndexer();
			}

			// Restart aggregators process if needed
			if (
				!aggregatorsHealth.indexer.running &&
				aggregatorsHealth.indexer.restarts < this.config.maxRetries
			) {
				console.log("⚠️ Aggregators indexer not running, restarting...");
				await this.aggregatorsProcessManager.restartIndexer();
			}
		};

		// Initial health check
		checkHealth();

		// Set up health monitoring interval
		const healthInterval = setInterval(checkHealth, this.config.checkInterval);
		this.cleanupFunctions.push(() => clearInterval(healthInterval));

		// Status reporting
		const statusInterval = setInterval(
			() => {
				const flagsHealth = this.flagsProcessManager.getHealthStatus();
				const aggregatorsHealth =
					this.aggregatorsProcessManager.getHealthStatus();
				const stats = this.discovery.getStats();

				console.log("📊 Status Report:");
				console.log(
					`  Flags Process: ${flagsHealth.indexer.running ? "✅" : "❌"} (uptime: ${Math.floor(flagsHealth.indexer.uptime / 1000)}s)`,
				);
				console.log(
					`  Aggregators Process: ${aggregatorsHealth.indexer.running ? "✅" : "❌"} (uptime: ${Math.floor(aggregatorsHealth.indexer.uptime / 1000)}s)`,
				);
				console.log(
					`  Discovered Aggregators: ${stats.total} across ${Object.keys(stats.byChain).length} chains`,
				);
			},
			2 * 60 * 1000,
		); // Every 2 minutes

		this.cleanupFunctions.push(() => clearInterval(statusInterval));
	}

	/**
	 * Stop the supervisor
	 */
	async stop(): Promise<void> {
		if (!this.isRunning) {
			console.log("⚠️ Chainlink Supervisor is not running");
			return;
		}

		console.log("🛑 Stopping Chainlink Supervisor...");
		this.isRunning = false;

		// Run cleanup functions
		for (const cleanup of this.cleanupFunctions) {
			try {
				cleanup();
			} catch (error) {
				console.error("⚠️ Cleanup function failed:", error);
			}
		}
		this.cleanupFunctions = [];

		// Stop both processes
		await Promise.all([
			this.flagsProcessManager.stopAll(),
			this.aggregatorsProcessManager.stopAll(),
		]);

		console.log("✅ Chainlink Supervisor stopped");
	}

	/**
	 * Get current status
	 */
	getStatus(): {
		running: boolean;
		flagsProcess: Record<string, any>;
		aggregatorsProcess: Record<string, any>;
		aggregators: any;
		chains: string[];
	} {
		return {
			running: this.isRunning,
			flagsProcess: this.flagsProcessManager.getAllProcessInfo(),
			aggregatorsProcess: this.aggregatorsProcessManager.getAllProcessInfo(),
			aggregators: this.discovery.getStats(),
			chains: this.discovery.getChainsWithAggregators(),
		};
	}
}

// CLI interface
async function main() {
	const config: SupervisorConfig = {
		flagsApiUrl: process.env.FLAGS_API_URL || "http://localhost:42069",
		aggregatorsApiUrl:
			process.env.AGGREGATORS_API_URL || "http://localhost:42070",
		checkInterval: parseInt(process.env.CHECK_INTERVAL || "30000"),
		restartDelay: parseInt(process.env.RESTART_DELAY || "5000"),
		maxRetries: parseInt(process.env.MAX_RETRIES || "3"),
		dbConnectionString: process.env.DATABASE_URL,
	};

	const supervisor = new ChainlinkSupervisor(config);

	// Handle graceful shutdown
	const shutdown = async () => {
		console.log("\n🛑 Received shutdown signal...");
		await supervisor.stop();
		process.exit(0);
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
	process.on("SIGQUIT", shutdown);

	// Handle uncaught errors
	process.on("uncaughtException", async (error) => {
		console.error("💥 Uncaught exception:", error);
		await supervisor.stop();
		process.exit(1);
	});

	process.on("unhandledRejection", async (reason, promise) => {
		console.error("💥 Unhandled rejection at:", promise, "reason:", reason);
		await supervisor.stop();
		process.exit(1);
	});

	try {
		await supervisor.start();

		// Keep the process alive
		process.stdin.resume();
	} catch (error) {
		console.error("💥 Chainlink Supervisor failed to start:", error);
		process.exit(1);
	}
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
