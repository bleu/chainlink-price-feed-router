import tokenList from "../../data/1inch-tokenlist.json";

interface TokenInfo {
	address: string;
	chainId: number;
	decimals: number;
	symbol: string;
	name: string;
	logoURI?: string | null;
}

// Create a lookup map for faster searches
const tokenMap = new Map<string, TokenInfo>();

// Initialize the token map
tokenList.tokens.forEach((token: TokenInfo) => {
	const key = `${token.chainId}-${token.symbol.toUpperCase()}`;
	tokenMap.set(key, token);
});

export function findTokenBySymbol(
	symbol: string,
	chainId: number,
): TokenInfo | null {
	const key = `${chainId}-${symbol.toUpperCase()}`;
	return tokenMap.get(key) || null;
}
