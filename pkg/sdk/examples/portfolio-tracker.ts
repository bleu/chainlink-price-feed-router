/**
 * Portfolio tracking example using the Chainlink Registry SDK
 */

import {
	ChainlinkRegistryClient,
	describeRoute,
	getPriceAge,
	isPriceStale,
} from "../src";

interface Holding {
	token: string;
	amount: string;
	chainId?: number;
}

interface PortfolioValue {
	token: string;
	amount: string;
	price: string;
	value: string;
	route: string;
	dataAge: number;
	isStale: boolean;
	error?: string;
}

class PortfolioTracker {
	private client: ChainlinkRegistryClient;
	private baseCurrency: string;
	private defaultChainId: number;

	constructor(
		apiUrl: string,
		baseCurrency: string = "USD",
		defaultChainId: number = 1,
	) {
		this.client = new ChainlinkRegistryClient({ baseUrl: apiUrl });
		this.baseCurrency = baseCurrency;
		this.defaultChainId = defaultChainId;
	}

	/**
	 * Calculate the total value of a portfolio
	 */
	async calculatePortfolioValue(holdings: Holding[]): Promise<{
		holdings: PortfolioValue[];
		totalValue: string;
		currency: string;
		timestamp: string;
	}> {
		console.log(`📊 Calculating portfolio value in ${this.baseCurrency}...\n`);

		// Prepare batch requests
		const requests = holdings.map((holding) => ({
			chainId: (holding.chainId || this.defaultChainId) as any,
			fromToken: holding.token,
			toToken: this.baseCurrency,
		}));

		// Fetch all prices in parallel
		const quotes = await this.client.getBatchPriceQuotes(requests);

		// Process results
		const portfolioValues: PortfolioValue[] = [];
		let totalValue = 0;

		for (let i = 0; i < holdings.length; i++) {
			const holding = holdings[i];
			const quote = quotes[i];

			if (quote instanceof Error) {
				portfolioValues.push({
					token: holding.token,
					amount: holding.amount,
					price: "0",
					value: "0",
					route: "N/A",
					dataAge: 0,
					isStale: false,
					error: quote.message,
				});
				continue;
			}

			const price = parseFloat(quote.formattedPrice);
			const amount = parseFloat(holding.amount);
			const value = price * amount;
			const dataAge = getPriceAge(quote.updatedAt);
			const isStale = isPriceStale(quote.updatedAt, 300); // 5 minutes

			portfolioValues.push({
				token: holding.token,
				amount: holding.amount,
				price: quote.formattedPrice,
				value: value.toFixed(2),
				route: describeRoute(quote),
				dataAge,
				isStale,
			});

			totalValue += value;
		}

		return {
			holdings: portfolioValues,
			totalValue: totalValue.toFixed(2),
			currency: this.baseCurrency,
			timestamp: new Date().toISOString(),
		};
	}

	/**
	 * Display portfolio in a formatted table
	 */
	displayPortfolio(
		portfolio: Awaited<ReturnType<typeof this.calculatePortfolioValue>>,
	) {
		console.log("Portfolio Summary");
		console.log("=".repeat(80));
		console.log(
			"Token".padEnd(8) +
				"Amount".padEnd(15) +
				"Price".padEnd(15) +
				"Value".padEnd(15) +
				"Route".padEnd(20) +
				"Status",
		);
		console.log("-".repeat(80));

		for (const holding of portfolio.holdings) {
			const status = holding.error
				? "❌ Error"
				: holding.isStale
					? "⚠️ Stale"
					: "✅ Fresh";

			console.log(
				holding.token.padEnd(8) +
					holding.amount.padEnd(15) +
					`${holding.price} ${portfolio.currency}`.padEnd(15) +
					`${holding.value} ${portfolio.currency}`.padEnd(15) +
					holding.route.padEnd(20) +
					status,
			);

			if (holding.error) {
				console.log(`    Error: ${holding.error}`);
			} else if (holding.isStale) {
				console.log(`    Data age: ${holding.dataAge}s`);
			}
		}

		console.log("-".repeat(80));
		console.log(
			`Total Portfolio Value: ${portfolio.totalValue} ${portfolio.currency}`,
		);
		console.log(`Updated: ${portfolio.timestamp}\n`);
	}

	/**
	 * Monitor portfolio value changes
	 */
	async monitorPortfolio(holdings: Holding[], intervalSeconds: number = 30) {
		console.log(
			`🔄 Starting portfolio monitoring (${intervalSeconds}s intervals)...\n`,
		);

		let previousTotal = 0;

		const monitor = async () => {
			try {
				const portfolio = await this.calculatePortfolioValue(holdings);
				const currentTotal = parseFloat(portfolio.totalValue);
				const change = currentTotal - previousTotal;
				const changePercent =
					previousTotal > 0 ? (change / previousTotal) * 100 : 0;

				console.clear();
				console.log(
					`🔄 Portfolio Monitor - ${new Date().toLocaleTimeString()}\n`,
				);

				this.displayPortfolio(portfolio);

				if (previousTotal > 0) {
					const changeIcon = change >= 0 ? "📈" : "📉";
					const changeColor = change >= 0 ? "\x1b[32m" : "\x1b[31m"; // Green/Red
					const resetColor = "\x1b[0m";

					console.log(
						`${changeIcon} Change: ${changeColor}${change >= 0 ? "+" : ""}${change.toFixed(2)} ` +
							`${portfolio.currency} (${changePercent >= 0 ? "+" : ""}${changePercent.toFixed(2)}%)${resetColor}\n`,
					);
				}

				previousTotal = currentTotal;
			} catch (error) {
				console.error("❌ Error updating portfolio:", error.message);
			}
		};

		// Initial calculation
		await monitor();

		// Set up interval
		setInterval(monitor, intervalSeconds * 1000);
	}
}

// Example usage
async function portfolioExample() {
	const tracker = new PortfolioTracker("http://localhost:42069", "USD", 1);

	// Example portfolio
	const myPortfolio: Holding[] = [
		{ token: "BTC", amount: "0.5" },
		{ token: "ETH", amount: "2.0" },
		{ token: "LINK", amount: "100" },
		{ token: "USDC", amount: "1000" },
	];

	try {
		// One-time calculation
		const portfolio = await tracker.calculatePortfolioValue(myPortfolio);
		tracker.displayPortfolio(portfolio);

		// Uncomment to start monitoring
		// await tracker.monitorPortfolio(myPortfolio, 30);
	} catch (error) {
		console.error("❌ Portfolio calculation failed:", error.message);
	}
}

// Run the example
if (require.main === module) {
	portfolioExample().catch(console.error);
}

export { PortfolioTracker, portfolioExample };
