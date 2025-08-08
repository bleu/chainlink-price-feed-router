#!/usr/bin/env node

import path from "node:path";
import { AggregatorDiscovery } from "./aggregator-discovery";
import { ConfigGenerator } from "./config-generator";
import { PonderMonitor } from "./ponder-monitor";
import { ProcessManager } from "./process-manager";
import type { SupervisorConfig } from "./types";

class ChainlinkRegistrySupervisor {
	private monitor: PonderMonitor;
	private discovery: AggregatorDiscovery;
	private configGenerator: ConfigGenerator;
	private processManager: ProcessManager;
	private config: SupervisorConfig;
	private isRunning = false;
	private cleanupFunctions: (() => void)[] = [];

	constructor(config: SupervisorConfig) {
		this.config = config;
		this.monitor = new PonderMonitor(config);
		this.discovery = new AggregatorDiscovery();
		this.configGenerator = new ConfigGenerator(path.join(process.cwd()));
		this.processManager = new ProcessManager(config);
	}

	/**
	 * Start the supervisor
	 */
	async start(): Promise<void> {
		if (this.isRunning) {
			console.log("⚠️ Supervisor is already running");
			return;
		}

		console.log("🚀 Starting Chainlink Registry Supervisor...");
		console.log(`📍 Project root: ${process.cwd()}`);
		console.log(`🌐 Ponder API: ${this.config.ponderApiUrl}`);
		console.log(`⏱️ Check interval: ${this.config.checkInterval}ms`);

		this.isRunning = true;

		try {
			// Phase 1: Start initial ponder process (flags indexing only)
			console.log("\n🔄 Phase 1: Starting initial flags indexing...");
			await this.startInitialIndexing();

			// Phase 2: Wait for chains to be ready and discover aggregators
			console.log("\n🔍 Phase 2: Waiting for chains to be ready...");
			await this.waitForChainsAndDiscover();

			// Phase 3: Generate new config with aggregators and restart
			console.log("\n🔧 Phase 3: Generating config with aggregators...");
			await this.generateConfigAndRestart();

			// Phase 4: Start monitoring and health checks
			console.log("\n🏥 Phase 4: Starting monitoring...");
			this.startMonitoring();

			console.log("\n✅ Supervisor started successfully!");
			console.log("📊 Monitoring ponder processes and aggregator discovery...");
		} catch (error) {
			console.error("❌ Failed to start supervisor:", error);
			await this.stop();
			throw error;
		}
	}

	/**
	 * Phase 1: Start initial ponder process for flags indexing
	 */
	private async startInitialIndexing(): Promise<void> {
		console.log("🚀 Starting initial ponder indexer...");

		// Set the database schema for flags-only indexing
		process.env.DATABASE_SCHEMA = "chainlink_registry_flags";
		console.log("🏷️ Using schema for flags: chainlink_registry_flags");

		const started = await this.processManager.startIndexer();
		if (!started) {
			throw new Error("Failed to start initial indexer");
		}

		// Also start the server for API access
		const serverStarted = await this.processManager.startServer();
		if (!serverStarted) {
			console.warn("⚠️ Failed to start server, continuing without API access");
		}

		console.log("✅ Initial indexing started");
	}

	/**
	 * Phase 2: Wait for chains to be ready and discover aggregators
	 */
	private async waitForChainsAndDiscover(): Promise<void> {
		console.log(`⏳ Waiting for historical sync to complete...`);

		let discoveryComplete = false;

		// Start monitoring and discover aggregators when chains become ready
		const stopMonitoring = this.monitor.startMonitoring(
			async (_readyChains) => {
				console.log(`🎉 Historical sync complete, discovering aggregators...`);

				// Discover aggregators from the database
				const aggregators = await this.discovery.discoverFromDatabase(
					this.config.ponderApiUrl,
				);

				if (aggregators.length > 0) {
					console.log(`📊 Discovered ${aggregators.length} aggregators total`);
					console.log(`✅ Ready to proceed with config generation`);
					discoveryComplete = true;
				} else {
					console.log(
						`⚠️ No aggregators discovered yet, will continue with flags-only indexing`,
					);
				}
			},
		);

		this.cleanupFunctions.push(stopMonitoring);

		// Wait for discovery to complete or timeout
		const maxWaitTime = 10 * 60 * 1000; // 10 minutes
		const startTime = Date.now();

		while (Date.now() - startTime < maxWaitTime && !discoveryComplete) {
			const readyChains = await this.monitor.getReadyChains();
			const aggregators = this.discovery.getAllAggregators();

			if (discoveryComplete) {
				console.log(
					`✅ Discovery complete: ${readyChains.length} chains ready, ${aggregators.length} aggregators discovered`,
				);
				break;
			}

			console.log(
				`⏳ Waiting... ${readyChains.length} chains ready, ${aggregators.length} aggregators discovered`,
			);
			await new Promise((resolve) => setTimeout(resolve, 5000)); // Check every 5 seconds
		}

		stopMonitoring();

		// Final check
		const finalAggregators = this.discovery.getAllAggregators();
		console.log(
			`🔍 Phase 2 complete: ${finalAggregators.length} aggregators discovered`,
		);
	}

	/**
	 * Phase 3: Generate new config with aggregators and restart
	 */
	private async generateConfigAndRestart(): Promise<void> {
		const aggregators = this.discovery.getAllAggregators();

		if (aggregators.length === 0) {
			console.log(
				"⚠️ No aggregators discovered, continuing with flags-only indexing",
			);
			return;
		}

		console.log(
			`🔧 Generating config with ${aggregators.length} aggregators...`,
		);

		// Generate new config
		const _configPath = await this.configGenerator.generateConfig(aggregators);

		// Validate the generated config
		const isValid = await this.configGenerator.validateGeneratedConfig();
		if (!isValid) {
			throw new Error("Generated config validation failed");
		}

		// Stop current processes
		console.log("🛑 Stopping current processes...");
		await this.processManager.stopAll();

		// Activate the new config
		console.log("🔄 Activating new config...");
		await this.configGenerator.activateGeneratedConfig();

		// Wait a bit for file system to settle
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Restart with new config
		console.log("🚀 Restarting with aggregator indexing...");
		const restarted = await this.processManager.restartAll();

		if (!restarted) {
			console.error(
				"❌ Failed to restart with new config, attempting rollback...",
			);
			// TODO: Implement rollback logic
			throw new Error("Failed to restart with new config");
		}

		console.log("✅ Successfully restarted with aggregator indexing");
	}

	/**
	 * Phase 4: Start monitoring
	 */
	private startMonitoring(): void {
		// Start process health monitoring
		const stopHealthMonitoring = this.processManager.startHealthMonitoring();
		this.cleanupFunctions.push(stopHealthMonitoring);

		// Start periodic aggregator discovery (for new feeds)
		const discoveryInterval = setInterval(
			async () => {
				try {
					console.log("🔍 Periodic aggregator discovery...");
					const newAggregators = await this.discovery.discoverFromDatabase(
						this.config.ponderApiUrl,
					);
					const currentCount = this.discovery.getAllAggregators().length;

					if (newAggregators.length > currentCount) {
						console.log(
							`📈 Found ${newAggregators.length - currentCount} new aggregators`,
						);
						// TODO: Implement hot-reload of config for new aggregators
					}
				} catch (error) {
					console.error("❌ Periodic discovery failed:", error);
				}
			},
			5 * 60 * 1000,
		); // Every 5 minutes

		this.cleanupFunctions.push(() => clearInterval(discoveryInterval));

		// Log status periodically
		const statusInterval = setInterval(
			() => {
				const health = this.processManager.getHealthStatus();
				const stats = this.discovery.getStats();

				console.log("📊 Status Report:");
				console.log(
					`  Indexer: ${health.indexer.running ? "✅" : "❌"} (uptime: ${Math.floor(health.indexer.uptime / 1000)}s, restarts: ${health.indexer.restarts})`,
				);
				console.log(
					`  Server: ${health.server.running ? "✅" : "❌"} (uptime: ${Math.floor(health.server.uptime / 1000)}s, restarts: ${health.server.restarts})`,
				);
				console.log(
					`  Aggregators: ${stats.total} total across ${Object.keys(stats.byChain).length} chains`,
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
			console.log("⚠️ Supervisor is not running");
			return;
		}

		console.log("🛑 Stopping Chainlink Registry Supervisor...");
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

		// Stop all processes
		await this.processManager.stopAll();

		// Cleanup generated files
		await this.configGenerator.cleanup();

		console.log("✅ Supervisor stopped");
	}

	/**
	 * Get current status
	 */
	getStatus(): {
		running: boolean;
		processes: Record<string, any>;
		aggregators: any;
		chains: string[];
	} {
		return {
			running: this.isRunning,
			processes: this.processManager.getAllProcessInfo(),
			aggregators: this.discovery.getStats(),
			chains: this.discovery.getChainsWithAggregators(),
		};
	}
}

// CLI interface
async function main() {
	const config: SupervisorConfig = {
		ponderApiUrl: process.env.PONDER_API_URL || "http://localhost:42069",
		checkInterval: parseInt(process.env.CHECK_INTERVAL || "30000"),
		restartDelay: parseInt(process.env.RESTART_DELAY || "5000"),
		maxRetries: parseInt(process.env.MAX_RETRIES || "3"),
		dbConnectionString: process.env.DATABASE_URL,
	};

	const supervisor = new ChainlinkRegistrySupervisor(config);

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
		console.error("💥 Supervisor failed to start:", error);
		process.exit(1);
	}
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}

export { ChainlinkRegistrySupervisor };
