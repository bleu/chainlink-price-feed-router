import { createConfig } from "ponder";

import { ChainLinkDataFeedFlagsAbi } from "./abis/ChainLinkDataFeedFlagsAbi";

export default createConfig({
	chains: {
		ethereum: {
			id: 1,
			rpc: `https://lb.drpc.org/ethereum/${process.env.DRPC_API_KEY}`,
		},
		arbitrum: {
			id: 42161,
			rpc: `https://lb.drpc.org/arbitrum/${process.env.DRPC_API_KEY}`,
		},
		avalanche: {
			id: 43114,
			rpc: `https://lb.drpc.org/avalanche/${process.env.DRPC_API_KEY}`,
		},
		base: {
			id: 8453,
			rpc: `https://lb.drpc.org/base/${process.env.DRPC_API_KEY}`,
		},
		bob: {
			id: 60808,
			rpc: `https://lb.drpc.org/bob/${process.env.DRPC_API_KEY}`,
		},
		// bsc: {
		// 	id: 56,
		// 	rpc: `https://lb.drpc.org/bsc/${process.env.DRPC_API_KEY}`,
		// 	// Note: BSC disabled due to RPC instability issues
		// },
		celo: {
			id: 42220,
			rpc: `https://lb.drpc.org/celo/${process.env.DRPC_API_KEY}`,
		},
		gnosis: {
			id: 100,
			rpc: `https://lb.drpc.org/gnosis/${process.env.DRPC_API_KEY}`,
		},
		ink: {
			id: 57073,
			rpc: `https://lb.drpc.org/ink/${process.env.DRPC_API_KEY}`,
		},
		linea: {
			id: 59144,
			rpc: `https://lb.drpc.org/linea/${process.env.DRPC_API_KEY}`,
		},
		mantle: {
			id: 5000,
			rpc: `https://lb.drpc.org/mantle/${process.env.DRPC_API_KEY}`,
		},
		optimism: {
			id: 10,
			rpc: `https://lb.drpc.org/optimism/${process.env.DRPC_API_KEY}`,
		},
		polygon: {
			id: 137,
			rpc: `https://lb.drpc.org/polygon/${process.env.DRPC_API_KEY}`,
		},
		scroll: {
			id: 534352,
			rpc: `https://lb.drpc.org/scroll/${process.env.DRPC_API_KEY}`,
		},
		soneium: {
			id: 1868,
			rpc: `https://lb.drpc.org/soneium/${process.env.DRPC_API_KEY}`,
		},
		sonic: {
			id: 146,
			rpc: `https://lb.drpc.org/sonic/${process.env.DRPC_API_KEY}`,
		},
		unichain: {
			id: 130,
			rpc: `https://lb.drpc.org/unichain/${process.env.DRPC_API_KEY}`,
		},
		zksync: {
			id: 324,
			rpc: `https://lb.drpc.org/zksync/${process.env.DRPC_API_KEY}`,
		},
	},
	contracts: {
		ChainLinkDataFeedFlags: {
			abi: ChainLinkDataFeedFlagsAbi,
			chain: {
				ethereum: {
					address: "0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e",
					startBlock: 22031347,
				},
				arbitrum: {
					address: "0x20551B03c092D998b1410c47BD54004D7C3106D0",
					startBlock: 314969848,
				},
				avalanche: {
					address: "0x71c5CC2aEB9Fa812CA360E9bAC7108FC23312cdd",
					startBlock: 58621332,
				},
				base: {
					address: "0x71c5CC2aEB9Fa812CA360E9bAC7108FC23312cdd",
					startBlock: 27544881,
				},
				bob: {
					address: "0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e",
					startBlock: 14513762,
				},
				// bsc: {
				// 	address: "0x141f4278A5D71070Dc09CA276b72809b80F20eF0",
				// 	startBlock: 47432326,
				// },
				celo: {
					address: "0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e",
					startBlock: 30842796,
				},
				gnosis: {
					address: "0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e",
					startBlock: 39015359,
				},
				ink: {
					address: "0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e",
					startBlock: 8390783,
				},
				linea: {
					address: "0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e",
					startBlock: 16897214,
				},
				mantle: {
					address: "0x141f4278A5D71070Dc09CA276b72809b80F20eF0",
					startBlock: 76879554,
				},
				optimism: {
					address: "0x71c5CC2aEB9Fa812CA360E9bAC7108FC23312cdd",
					startBlock: 133140417,
				},
				polygon: {
					address: "0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e",
					startBlock: 69003366,
				},
				scroll: {
					address: "0x141f4278A5D71070Dc09CA276b72809b80F20eF0",
					startBlock: 14009465,
				},
				soneium: {
					address: "0x3DE960FE090BFec72F585347fa0a27CF96a83b36",
					startBlock: 4377309,
				},
				sonic: {
					address: "0x141f4278A5D71070Dc09CA276b72809b80F20eF0",
					startBlock: 13503074,
				},
				unichain: {
					address: "0xaB93491064aEE774BE4b8a1cFFe4421F5B124F4e",
					startBlock: 11140474,
				},
				zksync: {
					address: "0xC370405879C1ab0470604679E3275a02bCb89C91",
					startBlock: 57665872,
				},
			},
		},
	},
});
