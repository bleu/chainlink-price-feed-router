#!/usr/bin/env node

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

	constructor(config: SupervisorConfig) {
		this.config = config;
		this.discovery = new AggregatorDiscovery();

		// Get paths to the indexer apps
		const flagsAppPath = path.resolve(
			process.cwd(),
			"../chainlink-flags-indexer",
		);
		const aggregatorsAppPath = path.resolve(
			process.cwd(),
			"../chainlink-aggregators-indexer",
		);

		this.configGenerator = new ConfigGenerator(aggregatorsAppPath);
		this.flagsProcessManager = new ProcessManager(flagsAppPath, "flags");
		this.aggregatorsProcessManager = new ProcessManager(
			aggregatorsAppPath,
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
			// Start flags process (always running)
			console.log("\n🏁 Starting flags indexer process...");
			await this.startFlagsProcess();

			// Start aggregator process (starts with empty aggregator config)
			console.log("\n📊 Starting aggregators indexer process...");
			await this.startAggregatorsProcess();

			// Start discovery polling
			console.log("\n🔍 Starting aggregator discovery polling...");
			this.startDiscoveryPolling();

			// Start health monitoring
			console.log("\n🏥 Starting health monitoring...");
			this.startHealthMonitoring();

			console.log("\n✅ Chainlink Supervisor started successfully!");
			console.log(
				"📊 Monitoring both processes and discovering aggregators...",
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

		const serverStarted = await this.flagsProcessManager.startServer();
		if (!serverStarted) {
			console.warn("⚠️ Failed to start flags server");
		}

		console.log("✅ Flags process started");
	}

	/**
	 * Start the aggregators process
	 */
	private async startAggregatorsProcess(): Promise<void> {
		console.log("🚀 Starting aggregators indexer process...");

		const indexerStarted = await this.aggregatorsProcessManager.startIndexer();
		if (!indexerStarted) {
			throw new Error("Failed to start aggregators indexer");
		}

		const serverStarted = await this.aggregatorsProcessManager.startServer();
		if (!serverStarted) {
			console.warn("⚠️ Failed to start aggregators server");
		}

		console.log(
			"✅ Aggregators process started (with empty aggregator config)",
		);
	}

	/**
	 * Start polling for new aggregators
	 */
	private startDiscoveryPolling(): void {
		console.log("🔍 Starting aggregator discovery polling...");

		const pollForNewAggregators = async () => {
			try {
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

					// Update aggregator process config
					await this.updateAggregatorsConfig(newAggregators);
				} else if (
					newAggregators.length === 0 &&
					currentAggregators.length === 0
				) {
					console.log(
						"⏳ No aggregators discovered yet, waiting for flags to be indexed...",
					);
				} else if (newAggregators.length === currentAggregators.length) {
					console.log(`📊 No new aggregators (${newAggregators.length} total)`);
				}
			} catch (error) {
				console.error("❌ Discovery polling failed:", error);
			}
		};

		// Initial discovery
		pollForNewAggregators();

		// Set up polling interval
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

			if (
				!flagsHealth.server.running &&
				flagsHealth.server.restarts < this.config.maxRetries
			) {
				console.log("⚠️ Flags server not running, restarting...");
				await this.flagsProcessManager.startServer();
			}

			// Restart aggregators process if needed
			if (
				!aggregatorsHealth.indexer.running &&
				aggregatorsHealth.indexer.restarts < this.config.maxRetries
			) {
				console.log("⚠️ Aggregators indexer not running, restarting...");
				await this.aggregatorsProcessManager.restartIndexer();
			}

			if (
				!aggregatorsHealth.server.running &&
				aggregatorsHealth.server.restarts < this.config.maxRetries
			) {
				console.log("⚠️ Aggregators server not running, restarting...");
				await this.aggregatorsProcessManager.startServer();
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
					`  Flags Indexer: ${flagsHealth.indexer.running ? "✅" : "❌"} (uptime: ${Math.floor(flagsHealth.indexer.uptime / 1000)}s)`,
				);
				console.log(
					`  Flags Server: ${flagsHealth.server.running ? "✅" : "❌"} (uptime: ${Math.floor(flagsHealth.server.uptime / 1000)}s)`,
				);
				console.log(
					`  Aggregators Indexer: ${aggregatorsHealth.indexer.running ? "✅" : "❌"} (uptime: ${Math.floor(aggregatorsHealth.indexer.uptime / 1000)}s)`,
				);
				console.log(
					`  Aggregators Server: ${aggregatorsHealth.server.running ? "✅" : "❌"} (uptime: ${Math.floor(aggregatorsHealth.server.uptime / 1000)}s)`,
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
