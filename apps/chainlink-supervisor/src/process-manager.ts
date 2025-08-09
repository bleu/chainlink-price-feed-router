import { type ChildProcess, spawn } from "node:child_process";
import type { ProcessInfo } from "./types";

export class ProcessManager {
	private processes = new Map<string, ChildProcess>();
	private processInfo = new Map<string, ProcessInfo>();
	private appPath: string;
	private appName: string;

	constructor(appPath: string, appName: string) {
		this.appPath = appPath;
		this.appName = appName;
	}

	/**
	 * Start the ponder indexer process
	 */
	async startIndexer(): Promise<boolean> {
		console.log(`🚀 Starting ${this.appName} indexer...`);

		try {
			const childProcess = spawn("pnpm", ["ponder", "start"], {
				cwd: this.appPath,
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
				console.log(
					`[${this.appName.toUpperCase()} INDEXER] ${data.toString().trim()}`,
				);
			});

			childProcess.stderr?.on("data", (data) => {
				console.error(
					`[${this.appName.toUpperCase()} INDEXER ERROR] ${data.toString().trim()}`,
				);
			});

			// Handle process exit
			childProcess.on("exit", (code, signal) => {
				console.log(
					`🔴 ${this.appName} indexer process exited with code ${code}, signal ${signal}`,
				);
				this.processInfo.delete("indexer");
				this.processes.delete("indexer");
			});

			childProcess.on("error", (error) => {
				console.error(`❌ ${this.appName} indexer process error:`, error);
				this.processInfo.delete("indexer");
				this.processes.delete("indexer");
			});

			// Wait a bit to see if process starts successfully
			await new Promise((resolve) => setTimeout(resolve, 2000));

			if (childProcess.killed || childProcess.exitCode !== null) {
				console.error(`❌ ${this.appName} indexer failed to start`);
				return false;
			}

			console.log(
				`✅ ${this.appName} indexer started with PID ${childProcess.pid}`,
			);
			return true;
		} catch (error) {
			console.error(`❌ Failed to start ${this.appName} indexer:`, error);
			return false;
		}
	}

	/**
	 * Start the ponder server process (API only)
	 */
	async startServer(): Promise<boolean> {
		console.log(`🌐 Starting ${this.appName} server...`);

		try {
			const childProcess = spawn("pnpm", ["ponder", "serve"], {
				cwd: this.appPath,
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
				console.log(
					`[${this.appName.toUpperCase()} SERVER] ${data.toString().trim()}`,
				);
			});

			childProcess.stderr?.on("data", (data) => {
				console.error(
					`[${this.appName.toUpperCase()} SERVER ERROR] ${data.toString().trim()}`,
				);
			});

			// Handle process exit
			childProcess.on("exit", (code, signal) => {
				console.log(
					`🔴 ${this.appName} server process exited with code ${code}, signal ${signal}`,
				);
				this.processInfo.delete("server");
				this.processes.delete("server");
			});

			childProcess.on("error", (error) => {
				console.error(`❌ ${this.appName} server process error:`, error);
				this.processInfo.delete("server");
				this.processes.delete("server");
			});

			// Wait a bit to see if process starts successfully
			await new Promise((resolve) => setTimeout(resolve, 2000));

			if (childProcess.killed || childProcess.exitCode !== null) {
				console.error(`❌ ${this.appName} server failed to start`);
				return false;
			}

			console.log(
				`✅ ${this.appName} server started with PID ${childProcess.pid}`,
			);
			return true;
		} catch (error) {
			console.error(`❌ Failed to start ${this.appName} server:`, error);
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
			console.log(`⚠️ ${this.appName} ${processType} process not running`);
			return true;
		}

		console.log(
			`🛑 Stopping ${this.appName} ${processType} process (PID ${info.pid})...`,
		);

		try {
			// Try graceful shutdown first
			childProcess.kill("SIGTERM");

			// Wait for graceful shutdown
			await new Promise((resolve) => {
				const timeout = setTimeout(() => {
					console.log(
						`⏰ ${this.appName} ${processType} didn't stop gracefully, forcing...`,
					);
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

			console.log(`✅ ${this.appName} ${processType} process stopped`);
			return true;
		} catch (error) {
			console.error(`❌ Failed to stop ${this.appName} ${processType}:`, error);
			return false;
		}
	}

	/**
	 * Stop all processes
	 */
	async stopAll(): Promise<boolean> {
		console.log(`🛑 Stopping all ${this.appName} processes...`);

		const results = await Promise.all([
			this.stopProcess("indexer"),
			this.stopProcess("server"),
		]);

		const allStopped = results.every((result) => result);

		if (allStopped) {
			console.log(`✅ All ${this.appName} processes stopped`);
		} else {
			console.error(`❌ Some ${this.appName} processes failed to stop`);
		}

		return allStopped;
	}

	/**
	 * Restart the indexer process
	 */
	async restartIndexer(): Promise<boolean> {
		console.log(`🔄 Restarting ${this.appName} indexer...`);

		const info = this.processInfo.get("indexer");
		if (info) {
			info.status = "restarting";
			info.restarts += 1;
		}

		// Stop current indexer
		await this.stopProcess("indexer");

		// Wait a bit before restarting
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Start new indexer
		const started = await this.startIndexer();

		if (started) {
			console.log(`✅ ${this.appName} indexer restarted successfully`);
		} else {
			console.error(`❌ Failed to restart ${this.appName} indexer`);
		}

		return started;
	}

	/**
	 * Restart all processes
	 */
	async restartAll(): Promise<boolean> {
		console.log(`🔄 Restarting all ${this.appName} processes...`);

		// Stop all processes
		await this.stopAll();

		// Wait before restarting
		await new Promise((resolve) => setTimeout(resolve, 5000));

		// Start processes
		const indexerStarted = await this.startIndexer();
		const serverStarted = await this.startServer();

		const allStarted = indexerStarted && serverStarted;

		if (allStarted) {
			console.log(`✅ All ${this.appName} processes restarted successfully`);
		} else {
			console.error(`❌ Some ${this.appName} processes failed to restart`);
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
}
