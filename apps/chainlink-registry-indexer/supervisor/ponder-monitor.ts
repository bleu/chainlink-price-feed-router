import fetch from "cross-fetch";
import type { IndexingStatus, SupervisorConfig } from "./types";

export class PonderMonitor {
	private config: SupervisorConfig;
	private lastKnownStatus: IndexingStatus = {};

	constructor(config: SupervisorConfig) {
		this.config = config;
	}

	/**
	 * Check if ponder is ready (historical indexing complete)
	 */
	async isReady(): Promise<boolean> {
		try {
			const response = await fetch(`${this.config.ponderApiUrl}/ready`, {
				timeout: 5000,
			});
			return response.ok;
		} catch (error) {
			console.error("Failed to check ponder ready status:", error);
			return false;
		}
	}

	/**
	 * Get current indexing status for all chains
	 */
	async getIndexingStatus(): Promise<IndexingStatus | null> {
		try {
			const response = await fetch(`${this.config.ponderApiUrl}/status`, {
				timeout: 5000,
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const status = (await response.json()) as IndexingStatus;
			this.lastKnownStatus = status;
			return status;
		} catch (error) {
			console.error("Failed to get indexing status:", error);
			return null;
		}
	}

	/**
	 * Check if a specific chain has completed initial indexing
	 */
	async isChainReady(chainName: string): Promise<boolean> {
		// If we can get status for the chain, it means historical sync is complete
		const status = await this.getIndexingStatus();
		return !!status?.[chainName];
	}

	/**
	 * Get chains that have completed initial indexing
	 */
	async getReadyChains(): Promise<string[]> {
		const status = await this.getIndexingStatus();
		if (!status) return [];

		// All chains in the status response have completed historical sync
		return Object.keys(status);
	}

	/**
	 * Wait for any chains to be ready (historical sync complete)
	 */
	async waitForAnyChains(timeoutMs: number = 300000): Promise<boolean> {
		const startTime = Date.now();

		while (Date.now() - startTime < timeoutMs) {
			const readyChains = await this.getReadyChains();

			if (readyChains.length > 0) {
				console.log(`✅ Chains ready: ${readyChains.join(", ")}`);
				return true;
			}

			console.log(`⏳ Waiting for historical sync to complete...`);

			await new Promise((resolve) =>
				setTimeout(resolve, this.config.checkInterval),
			);
		}

		console.log(`⏰ Timeout waiting for historical sync`);
		return false;
	}

	/**
	 * Monitor indexing progress and call callback when chains become ready
	 */
	startMonitoring(onChainsReady: (readyChains: string[]) => void): () => void {
		let hasCalledCallback = false;

		const checkStatus = async () => {
			try {
				const status = await this.getIndexingStatus();
				if (!status) return;

				const readyChains = Object.keys(status);

				if (readyChains.length > 0 && !hasCalledCallback) {
					hasCalledCallback = true;
					console.log(
						`🎉 Historical sync complete for chains: ${readyChains.join(", ")}`,
					);
					onChainsReady(readyChains);
				}
			} catch (error) {
				console.error("Error monitoring indexing status:", error);
			}
		};

		// Initial check
		checkStatus();

		// Set up interval
		const intervalId = setInterval(checkStatus, this.config.checkInterval);

		// Return cleanup function
		return () => {
			clearInterval(intervalId);
		};
	}

	/**
	 * Get the last known status (useful when API is down)
	 */
	getLastKnownStatus(): IndexingStatus {
		return this.lastKnownStatus;
	}

	/**
	 * Check if ponder API is responding
	 */
	async isApiHealthy(): Promise<boolean> {
		try {
			const response = await fetch(`${this.config.ponderApiUrl}/status`, {
				timeout: 3000,
			});
			return response.ok;
		} catch {
			return false;
		}
	}
}
