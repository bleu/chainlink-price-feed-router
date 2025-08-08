import { type ChildProcess, spawn } from "node:child_process";
import type { ProcessInfo, SupervisorConfig } from "./types";

export class ProcessManager {
	private processes = new Map<string, ChildProcess>();
	private processInfo = new Map<string, ProcessInfo>();
	private config: SupervisorConfig;

	constructor(config: SupervisorConfig) {
		this.config = config;
	}

	/**
	 * Start the ponder indexer process
	 */
	async startIndexer(): Promise<boolean> {
		console.log("🚀 Starting ponder indexer...");

		try {
			const childProcess = spawn("pnpm", ["ponder", "start"], {
				cwd: process.cwd(),
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					DATABASE_URL: process.env.DATABASE_URL,
					DRPC_API_KEY: process.env.DRPC_API_KEY,
				},
			});

			this.processes.set("indexer", childProcess);
			this.processInfo.set("indexer", {
				pid: childProcess.pid!,
				type: "indexer",
				status: "running",
				startedAt: Date.now(),
				restarts: 0,
			});

			// Handle process output
			childProcess.stdout?.on("data", (data) => {
				console.log(`[INDEXER] ${data.toString().trim()}`);
			});

			childProcess.stderr?.on("data", (data) => {
				console.error(`[INDEXER ERROR] ${data.toString().trim()}`);
			});

			// Handle process exit
			childProcess.on("exit", (code, signal) => {
				console.log(
					`🔴 Indexer process exited with code ${code}, signal ${signal}`,
				);
				this.processInfo.delete("indexer");
				this.processes.delete("indexer");
			});

			childProcess.on("error", (error) => {
				console.error("❌ Indexer process error:", error);
				this.processInfo.delete("indexer");
				this.processes.delete("indexer");
			});

			// Wait a bit to see if process starts successfully
			await new Promise((resolve) => setTimeout(resolve, 2000));

			if (childProcess.killed || childProcess.exitCode !== null) {
				console.error("❌ Indexer failed to start");
				return false;
			}

			console.log(`✅ Indexer started with PID ${childProcess.pid}`);
			return true;
		} catch (error) {
			console.error("❌ Failed to start indexer:", error);
			return false;
		}
	}

	/**
	 * Start the ponder server process (API only)
	 */
	async startServer(): Promise<boolean> {
		console.log("🌐 Starting ponder server...");

		try {
			const childProcess = spawn("pnpm", ["ponder", "serve"], {
				cwd: process.cwd(),
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					DATABASE_URL: process.env.DATABASE_URL,
					DRPC_API_KEY: process.env.DRPC_API_KEY,
				},
			});

			this.processes.set("server", childProcess);
			this.processInfo.set("server", {
				pid: childProcess.pid!,
				type: "server",
				status: "running",
				startedAt: Date.now(),
				restarts: 0,
			});

			// Handle process output
			childProcess.stdout?.on("data", (data) => {
				console.log(`[SERVER] ${data.toString().trim()}`);
			});

			childProcess.stderr?.on("data", (data) => {
				console.error(`[SERVER ERROR] ${data.toString().trim()}`);
			});

			// Handle process exit
			childProcess.on("exit", (code, signal) => {
				console.log(
					`🔴 Server process exited with code ${code}, signal ${signal}`,
				);
				this.processInfo.delete("server");
				this.processes.delete("server");
			});

			childProcess.on("error", (error) => {
				console.error("❌ Server process error:", error);
				this.processInfo.delete("server");
				this.processes.delete("server");
			});

			// Wait a bit to see if process starts successfully
			await new Promise((resolve) => setTimeout(resolve, 2000));

			if (childProcess.killed || childProcess.exitCode !== null) {
				console.error("❌ Server failed to start");
				return false;
			}

			console.log(`✅ Server started with PID ${childProcess.pid}`);
			return true;
		} catch (error) {
			console.error("❌ Failed to start server:", error);
			return false;
		}
	}

	/**
	 * Stop a specific process
	 */
	async stopProcess(processType: "indexer" | "server"): Promise<boolean> {
		const childProcess = this.processes.get(processType);
		const info = this.processInfo.get(processType);

		if (!childProcess || !info) {
			console.log(`⚠️ ${processType} process not running`);
			return true;
		}

		console.log(`🛑 Stopping ${processType} process (PID ${info.pid})...`);

		try {
			// Try graceful shutdown first
			childProcess.kill("SIGTERM");

			// Wait for graceful shutdown
			await new Promise((resolve) => {
				const timeout = setTimeout(() => {
					console.log(`⏰ ${processType} didn't stop gracefully, forcing...`);
					childProcess.kill("SIGKILL");
					resolve(void 0);
				}, 10000); // 10 second timeout

				childProcess.on("exit", () => {
					clearTimeout(timeout);
					resolve(void 0);
				});
			});

			this.processes.delete(processType);
			this.processInfo.delete(processType);

			console.log(`✅ ${processType} process stopped`);
			return true;
		} catch (error) {
			console.error(`❌ Failed to stop ${processType}:`, error);
			return false;
		}
	}

	/**
	 * Stop all processes
	 */
	async stopAll(): Promise<boolean> {
		console.log("🛑 Stopping all processes...");

		const results = await Promise.all([
			this.stopProcess("indexer"),
			this.stopProcess("server"),
		]);

		const allStopped = results.every((result) => result);

		if (allStopped) {
			console.log("✅ All processes stopped");
		} else {
			console.error("❌ Some processes failed to stop");
		}

		return allStopped;
	}

	/**
	 * Restart the indexer process
	 */
	async restartIndexer(): Promise<boolean> {
		console.log("🔄 Restarting indexer...");

		const info = this.processInfo.get("indexer");
		if (info) {
			info.status = "restarting";
			info.restarts += 1;
		}

		// Stop current indexer
		await this.stopProcess("indexer");

		// Wait a bit before restarting
		await new Promise((resolve) =>
			setTimeout(resolve, this.config.restartDelay),
		);

		// Start new indexer
		const started = await this.startIndexer();

		if (started) {
			console.log("✅ Indexer restarted successfully");
		} else {
			console.error("❌ Failed to restart indexer");
		}

		return started;
	}

	/**
	 * Restart all processes
	 */
	async restartAll(): Promise<boolean> {
		console.log("🔄 Restarting all processes...");

		// Stop all processes
		await this.stopAll();

		// Wait before restarting
		await new Promise((resolve) =>
			setTimeout(resolve, this.config.restartDelay),
		);

		// Start processes
		const indexerStarted = await this.startIndexer();
		const serverStarted = await this.startServer();

		const allStarted = indexerStarted && serverStarted;

		if (allStarted) {
			console.log("✅ All processes restarted successfully");
		} else {
			console.error("❌ Some processes failed to restart");
		}

		return allStarted;
	}

	/**
	 * Check if a process is running
	 */
	isProcessRunning(processType: "indexer" | "server"): boolean {
		const childProcess = this.processes.get(processType);
		const info = this.processInfo.get(processType);

		return !!(
			childProcess &&
			info &&
			info.status === "running" &&
			!childProcess.killed
		);
	}

	/**
	 * Get process information
	 */
	getProcessInfo(processType: "indexer" | "server"): ProcessInfo | null {
		return this.processInfo.get(processType) || null;
	}

	/**
	 * Get all process information
	 */
	getAllProcessInfo(): Record<string, ProcessInfo> {
		const result: Record<string, ProcessInfo> = {};
		for (const [type, info] of this.processInfo.entries()) {
			result[type] = info;
		}
		return result;
	}

	/**
	 * Get process health status
	 */
	getHealthStatus(): {
		indexer: { running: boolean; uptime: number; restarts: number };
		server: { running: boolean; uptime: number; restarts: number };
	} {
		const now = Date.now();

		const getStatus = (processType: "indexer" | "server") => {
			const info = this.processInfo.get(processType);
			return {
				running: this.isProcessRunning(processType),
				uptime: info ? now - info.startedAt : 0,
				restarts: info ? info.restarts : 0,
			};
		};

		return {
			indexer: getStatus("indexer"),
			server: getStatus("server"),
		};
	}

	/**
	 * Wait for a process to be ready
	 */
	async waitForProcess(
		processType: "indexer" | "server",
		timeoutMs: number = 30000,
	): Promise<boolean> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeoutMs) {
			if (this.isProcessRunning(processType)) {
				return true;
			}

			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		return false;
	}

	/**
	 * Clean up all processes on exit
	 */
	async cleanup(): Promise<void> {
		console.log("🧹 Cleaning up processes...");

		// Set up signal handlers for graceful shutdown
		const cleanup = async () => {
			await this.stopAll();
			process.exit(0);
		};

		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);
		process.on("exit", cleanup);
	}

	/**
	 * Monitor process health and restart if needed
	 */
	startHealthMonitoring(): () => void {
		console.log("🏥 Starting process health monitoring...");

		const checkHealth = async () => {
			const health = this.getHealthStatus();

			// Check if indexer needs restart
			if (
				!health.indexer.running &&
				health.indexer.restarts < this.config.maxRetries
			) {
				console.log("⚠️ Indexer not running, attempting restart...");
				await this.restartIndexer();
			}

			// Check if server needs restart
			if (
				!health.server.running &&
				health.server.restarts < this.config.maxRetries
			) {
				console.log("⚠️ Server not running, attempting restart...");
				await this.startServer();
			}
		};

		// Initial check
		checkHealth();

		// Set up interval
		const intervalId = setInterval(checkHealth, this.config.checkInterval);

		// Return cleanup function
		return () => {
			clearInterval(intervalId);
		};
	}
}
