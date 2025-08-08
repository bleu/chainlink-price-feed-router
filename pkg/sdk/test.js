// Simple test to verify the SDK works
const { ChainlinkRegistryClient } = require("./dist/index.js");

async function testSDK() {
	console.log("🧪 Testing Chainlink Registry SDK...\n");

	const client = new ChainlinkRegistryClient({
		baseUrl: "http://localhost:42069",
		timeout: 5000,
	});

	try {
		// Test health check
		console.log("1. Testing health check...");
		const health = await client.getHealth();
		console.log(`   ✅ Health: ${health.status}\n`);

		// Test available tokens
		console.log("2. Testing available tokens...");
		const tokens = await client.getAvailableTokens(8453); // Base chain
		console.log(`   ✅ Found ${tokens.count} tokens on Base\n`);

		// Test price quote
		console.log("3. Testing price quote...");
		const quote = await client.getPriceQuote(8453, "ETH", "USD");
		console.log(`   ✅ ETH/USD: ${quote.formattedPrice}`);
		console.log(`   Route: ${quote.route.path.join(" → ")}\n`);

		console.log("🎉 All tests passed!");
	} catch (error) {
		console.error("❌ Test failed:", error.message);
	}
}

testSDK();
