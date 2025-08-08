export interface ChainStatus {
	id: number;
	block: {
		number: number;
		timestamp: number;
	};
}

export interface IndexingStatus {
	[chainName: string]: ChainStatus;
}

export interface AggregatorInfo {
	address: string;
	description: string;
	chainId: number;
	chainName: string;
	status: "active" | "flagged";
	discoveredAt: number;
}

export interface SupervisorConfig {
	ponderApiUrl: string;
	checkInterval: number; // milliseconds
	restartDelay: number; // milliseconds
	maxRetries: number;
	dbConnectionString?: string;
}

export interface ProcessInfo {
	pid: number;
	type: "indexer" | "server";
	status: "running" | "stopped" | "restarting";
	startedAt: number;
	restarts: number;
}
