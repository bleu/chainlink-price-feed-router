/**
 * Basic usage examples for the Chainlink Registry SDK
 */

import {
	ChainlinkRegistryClient,
	NetworkError,
	RouteNotFoundError,
} from "../src";

async function basicExamples() {
	// Initialize the client
	const client = new ChainlinkRegistryClient({
		baseUrl: "http://localhost:42069", // Replace with your API URL
		timeout: 15000,
	});

	console.log("🚀 Chainlink Registry SDK Examples\n");

	try {
		// 1. Health check
		console.log("1. Checking API health...");
		const health = await client.getHealth();
		console.log(`   Status: ${health.status} at ${health.timestamp}\n`);

		// 2. Get available tokens
		console.log("2. Getting available tokens on Ethereum...");
		const tokens = await client.getAvailableTokens(1);
		console.log(
			`   Found ${tokens.count} tokens: ${tokens.tokens.slice(0, 10).join(", ")}...\n`,
		);

		// 3. Simple price quote
		console.log("3. Getting BTC/USD price...");
		const btcUsd = await client.getPriceQuote(1, "BTC", "USD");
		console.log(`   1 BTC = ${btcUsd.formattedPrice} USD`);
		console.log(
			`   Route: ${btcUsd.route.path.join(" → ")} (${btcUsd.route.hops} hops)`,
		);
		console.log(`   Updated: ${btcUsd.updatedAt}\n`);

		// 4. Multi-hop price quote
		console.log("4. Getting BTC/EUR price (likely multi-hop)...");
		const btcEur = await client.getPriceQuote(1, "BTC", "EUR");
		console.log(`   1 BTC = ${btcEur.formattedPrice} EUR`);
		console.log(
			`   Route: ${btcEur.route.path.join(" → ")} (${btcEur.route.hops} hops)`,
		);

		// Show conversion details
		btcEur.route.conversions.forEach((conversion, index) => {
			console.log(
				`   Step ${index + 1}: ${conversion.description} (${conversion.conversionType})`,
			);
			console.log(
				`           Price: ${conversion.feedFormattedPrice}, Updated: ${conversion.updatedAt}`,
			);
		});
		console.log();

		// 5. Batch quotes
		console.log("5. Getting multiple quotes in parallel...");
		const batchQuotes = await client.getBatchPriceQuotes([
			{ chainId: 1, fromToken: "ETH", toToken: "USD" },
			{ chainId: 1, fromToken: "LINK", toToken: "USD" },
			{ chainId: 1, fromToken: "USDC", toToken: "USD" },
		]);

		batchQuotes.forEach((result, index) => {
			const pairs = [
				["ETH", "USD"],
				["LINK", "USD"],
				["USDC", "USD"],
			];
			const [from, to] = pairs[index];

			if (result instanceof Error) {
				console.log(`   ${from}/${to}: Error - ${result.message}`);
			} else {
				console.log(
					`   ${from}/${to}: ${result.formattedPrice} (${result.route.hops} hops)`,
				);
			}
		});
		console.log();

		// 6. Check route availability
		console.log("6. Checking route availability...");
		const hasRoute = await client.hasRoute(1, "BTC", "JPY");
		console.log(`   BTC → JPY route exists: ${hasRoute}\n`);

		// 7. Different decimal precision
		console.log("7. Getting price with different decimal precision...");
		const highPrecision = await client.getPriceQuote(1, "BTC", "USD", {
			decimals: 8,
		});
		console.log(`   1 BTC = ${highPrecision.formattedPrice} USD (8 decimals)`);
		console.log(`   Raw price: ${highPrecision.price}\n`);

		// 8. Cross-chain example (if available)
		console.log("8. Cross-chain pricing...");
		try {
			const baseTokens = await client.getAvailableTokens(8453); // Base chain
			console.log(`   Base chain has ${baseTokens.count} tokens available`);

			if (
				baseTokens.tokens.includes("ETH") &&
				baseTokens.tokens.includes("USD")
			) {
				const baseEthUsd = await client.getPriceQuote(8453, "ETH", "USD");
				console.log(`   ETH/USD on Base: ${baseEthUsd.formattedPrice}`);
			}
		} catch (error) {
			console.log(`   Base chain not available: ${error.message}`);
		}
	} catch (error) {
		if (error instanceof RouteNotFoundError) {
			console.error("❌ Route not found:", error.message);
		} else if (error instanceof NetworkError) {
			console.error("❌ Network error:", error.message);
		} else {
			console.error("❌ Unexpected error:", error);
		}
	}
}

// Run the examples
if (require.main === module) {
	basicExamples().catch(console.error);
}

export { basicExamples };
