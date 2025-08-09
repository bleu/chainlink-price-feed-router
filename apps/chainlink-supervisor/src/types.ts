export interface SupervisorConfig {
	flagsApiUrl: string;
	aggregatorsApiUrl: string;
	checkInterval: number;
	restartDelay: number;
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

export interface AggregatorInfo {
	address: string;
	description: string;
	chainId: number;
	chainName: string;
	status: "active" | "deprecated";
	discoveredAt: number;
}

export interface IndexingStatus {
	[chainName: string]: {
		id: number;
		block: {
			number: number;
			timestamp: number;
		};
	};
}
