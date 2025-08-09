import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, client, desc, eq, graphql } from "ponder";
import config from "../../ponder.config";
import {
	dataFeed,
	dataFeedToken,
	priceUpdate,
	token,
} from "../../ponder.schema";
import { formatPrice } from "../utils/dataFeedUtils";

const app = new Hono();

const getChainSlugFromPonderConfig = (chainId: number) => {
	const chain = Object.entries(config.chains).find(
		([_key, value]) => value.id === chainId,
	);
	return chain?.[0];
};

// Enable CORS for all routes
app.use("*", cors());

// Price calculation utilities
function scalePrice(
	price: bigint,
	fromDecimals: number,
	toDecimals: number,
): bigint {
	if (fromDecimals < toDecimals) {
		const multiplier = 10n ** BigInt(toDecimals - fromDecimals);
		return price * multiplier;
	} else if (fromDecimals > toDecimals) {
		const divisor = 10n ** BigInt(fromDecimals - toDecimals);
		return price / divisor;
	}
	return price;
}

// formatPrice is now imported from utils/dataFeedUtils

async function fetchPriceDataFromDB(
	chainId: number,
	aggregatorAddress: string,
) {
	try {
		// Get the latest price update for this aggregator
		const latestPrice = await db
			.select({
				price: priceUpdate.price,
				decimals: priceUpdate.decimals,
				updatedAt: priceUpdate.updatedAt,
				timestamp: priceUpdate.timestamp,
				aggregatorAddress: priceUpdate.aggregatorAddress,
			})
			.from(priceUpdate)
			.where(
				and(
					eq(priceUpdate.chainId, chainId),
					eq(priceUpdate.aggregatorAddress, aggregatorAddress.toLowerCase()),
				),
			)
			.orderBy(desc(priceUpdate.timestamp))
			.limit(1);

		if (!latestPrice || latestPrice.length === 0) {
			console.warn(
				`No price data found for aggregator ${aggregatorAddress} on chain ${chainId}`,
			);
			return null;
		}

		const priceData = latestPrice[0];

		// Check if data is too stale (older than 24 hours for most feeds)
		const currentTime = BigInt(Math.floor(Date.now() / 1000));
		const dataAge = currentTime - priceData.timestamp;
		if (dataAge > 86400n) {
			console.warn(
				`Stale price data for ${aggregatorAddress}: ${dataAge} seconds old`,
			);
			// Still return the data but with a warning
		}

		return {
			price: BigInt(priceData.price),
			decimals: priceData.decimals || 8, // Default to 8 if null
			updatedAt: priceData.updatedAt,
			address: aggregatorAddress,
		};
	} catch (error) {
		console.error(
			`Failed to fetch price data from DB for ${aggregatorAddress}:`,
			error,
		);
		return null;
	}
}

// Build token graph for pathfinding
async function buildTokenGraph(chainId: number) {
	// Get all active data feeds for the chain
	const feeds = await db
		.select({
			id: dataFeed.id,
			address: dataFeed.address,
			description: dataFeed.description,
			status: dataFeed.status,
		})
		.from(dataFeed)
		.where(and(eq(dataFeed.chainId, chainId), eq(dataFeed.status, "active")));

	// Get all data feed token relationships
	const feedTokens = await db
		.select({
			dataFeedId: dataFeedToken.dataFeedId,
			tokenId: dataFeedToken.tokenId,
			position: dataFeedToken.position,
			symbol: token.symbol,
		})
		.from(dataFeedToken)
		.innerJoin(token, eq(dataFeedToken.tokenId, token.id))
		.innerJoin(dataFeed, eq(dataFeedToken.dataFeedId, dataFeed.id))
		.where(and(eq(dataFeed.chainId, chainId), eq(dataFeed.status, "active")));

	// Group tokens by data feed
	const feedToTokens = new Map<
		string,
		Array<{ symbol: string; position: number }>
	>();

	for (const feedToken of feedTokens) {
		if (!feedToTokens.has(feedToken.dataFeedId)) {
			feedToTokens.set(feedToken.dataFeedId, []);
		}
		feedToTokens.get(feedToken.dataFeedId)?.push({
			symbol: feedToken.symbol,
			position: feedToken.position,
		});
	}

	// Build directed graph - each edge represents a direct price conversion
	const graph = new Map<
		string,
		Array<{
			toToken: string;
			dataFeedAddress: string;
			description: string;
			conversionType: "direct" | "inverse";
		}>
	>();

	for (const feed of feeds) {
		const tokens = feedToTokens.get(feed.id);
		if (!tokens || tokens.length !== 2) continue; // Skip if not exactly 2 tokens

		// Sort by position to ensure consistent ordering
		tokens.sort((a, b) => a.position - b.position);
		const [baseToken, quoteToken] = tokens;
		if (!baseToken || !quoteToken) continue;

		// The feed gives us "baseToken price in quoteToken"
		// e.g., "BTC / USD" means "1 BTC = X USD"

		// Direct conversion: baseToken -> quoteToken (multiply by price)
		if (!graph.has(baseToken.symbol)) {
			graph.set(baseToken.symbol, []);
		}
		graph.get(baseToken.symbol)?.push({
			toToken: quoteToken.symbol,
			dataFeedAddress: feed.address,
			description: feed.description,
			conversionType: "direct",
		});

		// Inverse conversion: quoteToken -> baseToken (divide by price, i.e., multiply by 1/price)
		if (!graph.has(quoteToken.symbol)) {
			graph.set(quoteToken.symbol, []);
		}
		graph.get(quoteToken.symbol)?.push({
			toToken: baseToken.symbol,
			dataFeedAddress: feed.address,
			description: feed.description,
			conversionType: "inverse",
		});
	}

	return graph;
}

// Find shortest route between tokens using BFS
function findShortestRoute(
	graph: Map<
		string,
		Array<{
			toToken: string;
			dataFeedAddress: string;
			description: string;
			conversionType: "direct" | "inverse";
		}>
	>,
	fromToken: string,
	toToken: string,
	maxHops: number = 3,
) {
	if (fromToken === toToken) {
		return {
			path: [fromToken],
			conversions: [],
			hops: 0,
		};
	}

	const queue: Array<{
		currentToken: string;
		path: string[];
		conversions: {
			toToken: string;
			dataFeedAddress: string;
			description: string;
			conversionType: "direct" | "inverse";
		}[];
		visited: Set<string>;
	}> = [];

	const startingEdges = graph.get(fromToken) || [];

	for (const edge of startingEdges) {
		if (edge.toToken === toToken) {
			// Direct route found
			return {
				path: [fromToken, toToken],
				conversions: [edge],
				hops: 1,
			};
		}

		queue.push({
			currentToken: edge.toToken,
			path: [fromToken, edge.toToken],
			conversions: [edge],
			visited: new Set([fromToken, edge.toToken]),
		});
	}

	while (queue.length > 0) {
		const current = queue.shift();

		if (!current) {
			continue;
		}

		if (current.conversions.length >= maxHops) {
			continue; // Skip if we've reached max hops
		}

		const nextEdges = graph.get(current.currentToken) || [];

		for (const edge of nextEdges) {
			if (current.visited.has(edge.toToken)) {
				continue; // Skip if we've already visited this token (avoid cycles)
			}

			if (edge.toToken === toToken) {
				// Found the target!
				return {
					path: [...current.path, toToken],
					conversions: [...current.conversions, edge],
					hops: current.conversions.length + 1,
				};
			}

			// Add to queue for further exploration
			queue.push({
				currentToken: edge.toToken,
				path: [...current.path, edge.toToken],
				conversions: [...current.conversions, edge],
				visited: new Set([...current.visited, edge.toToken]),
			});
		}
	}

	return null; // No route found
}

// Price API endpoints
const priceApi = new Hono();

// Get price quote between two tokens
priceApi.get("/quote/:chainId/:fromToken/:toToken", async (c) => {
	try {
		const chainId = parseInt(c.req.param("chainId"));
		const fromToken = c.req.param("fromToken").toUpperCase();
		const toToken = c.req.param("toToken").toUpperCase();

		const maxHops = parseInt(c.req.query("maxHops") || "3");
		const targetDecimals = parseInt(c.req.query("decimals") || "18");

		if (Number.isNaN(chainId) || chainId <= 0) {
			return c.json({ error: "Invalid chain ID" }, 400);
		}

		if (!fromToken || !toToken) {
			return c.json({ error: "Missing token symbols" }, 400);
		}

		// Validate that the chain is supported (check if it exists in our config)
		const chainName = getChainSlugFromPonderConfig(chainId);
		if (!chainName) {
			return c.json(
				{
					error: "Unsupported chain",
					message: `Chain ${chainId} is not configured`,
				},
				400,
			);
		}

		// Same token
		if (fromToken === toToken) {
			return c.json({
				fromToken,
				toToken,
				chainId,
				price: `1${"0".repeat(targetDecimals)}`,
				formattedPrice: "1.0",
				decimals: targetDecimals,
				route: {
					path: [fromToken],
					hops: 0,
					dataFeeds: [],
				},
				updatedAt: new Date().toISOString(),
				timestamp: Date.now(),
			});
		}

		// Build token graph and find route
		const graph = await buildTokenGraph(chainId);
		const route = findShortestRoute(graph, fromToken, toToken, maxHops);

		if (!route) {
			return c.json(
				{
					error: "No route found",
					message: `No price route found between ${fromToken} and ${toToken} on chain ${chainId}`,
				},
				404,
			);
		}

		// Fetch price data for all conversions in the route using our indexed data
		const priceDataPromises = route.conversions.map(
			async (conversion: { dataFeedAddress: string }) => {
				// First get the aggregator address from the data feed
				const feed = await db
					.select({
						aggregatorAddress: dataFeed.aggregatorAddress,
					})
					.from(dataFeed)
					.where(
						and(
							eq(dataFeed.address, conversion.dataFeedAddress.toLowerCase()),
							eq(dataFeed.chainId, chainId),
						),
					)
					.limit(1);

				if (!feed || feed.length === 0 || !feed[0]?.aggregatorAddress) {
					console.warn(
						`No aggregator address found for data feed ${conversion.dataFeedAddress}`,
					);
					return null;
				}

				// Now fetch the latest price data from our database
				return fetchPriceDataFromDB(chainId, feed[0].aggregatorAddress);
			},
		);

		const priceDataArray = await Promise.all(priceDataPromises);

		// Filter out any failed fetches
		const validPriceData = priceDataArray.filter((data) => data !== null);

		if (validPriceData.length !== route.conversions.length) {
			return c.json({ error: "Failed to fetch some price data" }, 500);
		}

		// Calculate derived price by chaining conversions
		let resultAmount = 10n ** BigInt(targetDecimals); // Start with 1.0 unit of fromToken
		let oldestTimestamp = validPriceData[0]?.updatedAt || 0n;

		for (let i = 0; i < validPriceData.length; i++) {
			const priceData = validPriceData[i];
			if (!priceData) {
				return c.json({ error: "Failed to fetch some price data" }, 500);
			}
			const conversion = route.conversions[i];

			if (conversion?.conversionType === "direct") {
				// Direct: multiply by price (e.g., BTC -> USD: amount_btc * price_btc_usd)
				const scaledPrice = scalePrice(
					priceData.price,
					priceData.decimals,
					targetDecimals,
				);
				resultAmount =
					(resultAmount * scaledPrice) / 10n ** BigInt(targetDecimals);
			} else {
				// Inverse: divide by price (e.g., USD -> BTC: amount_usd / price_btc_usd)
				const scaledPrice = scalePrice(
					priceData.price,
					priceData.decimals,
					targetDecimals,
				);
				resultAmount =
					(resultAmount * 10n ** BigInt(targetDecimals)) / scaledPrice;
			}

			if (priceData.updatedAt < oldestTimestamp) {
				oldestTimestamp = priceData.updatedAt;
			}
		}

		return c.json({
			fromToken,
			toToken,
			chainId,
			price: resultAmount.toString(),
			formattedPrice: formatPrice(resultAmount, targetDecimals),
			decimals: targetDecimals,
			route: {
				path: route.path,
				hops: route.hops,
				conversions: route.conversions.map(
					(
						conversion: {
							dataFeedAddress: string;
							description: string;
							conversionType: string;
						},
						index: number,
					) => {
						const priceData = validPriceData[index];
						if (!priceData) {
							return null;
						}

						return {
							address: conversion.dataFeedAddress,
							description: conversion.description,
							conversionType: conversion.conversionType,
							feedPrice: priceData.price.toString(),
							feedFormattedPrice: formatPrice(
								priceData.price,
								priceData.decimals,
							),
							decimals: priceData.decimals,
							updatedAt: new Date(
								Number(priceData.updatedAt) * 1000,
							).toISOString(),
						};
					},
				),
			},
			updatedAt: new Date(Number(oldestTimestamp) * 1000).toISOString(),
			timestamp: Date.now(),
		});
	} catch (error) {
		console.error("Price quote error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// Get available tokens for a chain
priceApi.get("/tokens/:chainId", async (c) => {
	try {
		const chainId = parseInt(c.req.param("chainId"));

		if (Number.isNaN(chainId) || chainId <= 0) {
			return c.json({ error: "Invalid chain ID" }, 400);
		}

		const tokens = await db
			.select({
				symbol: token.symbol,
			})
			.from(token)
			.innerJoin(dataFeedToken, eq(token.id, dataFeedToken.tokenId))
			.innerJoin(dataFeed, eq(dataFeedToken.dataFeedId, dataFeed.id))
			.where(and(eq(token.chainId, chainId), eq(dataFeed.status, "active")));

		// Remove duplicates and sort
		const uniqueTokens = [...new Set(tokens.map((t: any) => t.symbol))];
		const sortedTokens = uniqueTokens.sort();

		return c.json({
			chainId,
			tokens: sortedTokens,
			count: sortedTokens.length,
		});
	} catch (error) {
		console.error("Tokens error:", error);
		return c.json({ error: "Internal server error" }, 500);
	}
});

// Health check endpoint
priceApi.get("/health", (c) => {
	return c.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		service: "chainlink-price-api",
	});
});

// API documentation endpoint
priceApi.get("/", (c) => {
	return c.json({
		name: "Chainlink Price API",
		version: "1.0.0",
		endpoints: {
			"GET /price/quote/:chainId/:fromToken/:toToken": {
				description: "Get price quote between two tokens",
				parameters: {
					chainId: "Chain ID (e.g., 1 for Ethereum)",
					fromToken: "Source token symbol (e.g., BTC)",
					toToken: "Target token symbol (e.g., EUR)",
				},
				query: {
					maxHops: "Maximum number of hops (default: 3)",
					decimals: "Target decimal precision (default: 18)",
				},
			},
			"GET /price/tokens/:chainId": {
				description: "Get available tokens for a chain",
				parameters: {
					chainId: "Chain ID",
				},
			},
		},
		examples: {
			"BTC to EUR price": "/price/quote/1/BTC/EUR",
			"Available tokens on Ethereum": "/price/tokens/1",
		},
	});
});

// Mount price API
app.route("/price", priceApi);

// Existing endpoints
app.use("/sql/*", client({ db, schema }));
app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

export default app;
