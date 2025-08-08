#!/bin/bash

# Chainlink Registry Monitor Script

echo "🔍 Chainlink Registry System Monitor"
echo "=================================="
echo ""

# Check if ponder is running
if curl -s http://localhost:42069/health > /dev/null 2>&1; then
    echo "✅ Ponder API is running"
    
    # Get indexing status
    echo ""
    echo "📊 Indexing Status:"
    curl -s http://localhost:42069/status | jq -r 'to_entries[] | "  \(.key): block \(.value.block.number)"' 2>/dev/null || echo "  Unable to parse status"
    
    # Check if ready
    echo ""
    if curl -s http://localhost:42069/ready | grep -q "Historical indexing is complete"; then
        echo "✅ Historical indexing complete"
    else
        echo "⏳ Historical indexing in progress"
    fi
    
    # Get data feed count
    echo ""
    echo "📈 Data Feed Statistics:"
    FEED_COUNT=$(curl -s -X POST http://localhost:42069/graphql \
        -H "Content-Type: application/json" \
        -d '{"query": "{ dataFeeds { id } }"}' | \
        jq -r '.data.dataFeeds | length' 2>/dev/null)
    
    if [ "$FEED_COUNT" != "null" ] && [ "$FEED_COUNT" != "" ]; then
        echo "  Total data feeds: $FEED_COUNT"
        
        # Get active feeds
        ACTIVE_COUNT=$(curl -s -X POST http://localhost:42069/graphql \
            -H "Content-Type: application/json" \
            -d '{"query": "{ dataFeeds(where: { status: \"active\" }) { id } }"}' | \
            jq -r '.data.dataFeeds | length' 2>/dev/null)
        echo "  Active feeds: $ACTIVE_COUNT"
        
        # Get price updates count
        PRICE_COUNT=$(curl -s -X POST http://localhost:42069/graphql \
            -H "Content-Type: application/json" \
            -d '{"query": "{ priceUpdates { id } }"}' | \
            jq -r '.data.priceUpdates | length' 2>/dev/null)
        
        if [ "$PRICE_COUNT" != "null" ] && [ "$PRICE_COUNT" != "" ]; then
            echo "  Price updates recorded: $PRICE_COUNT"
        else
            echo "  Price updates: Not available (aggregator indexing may not be active)"
        fi
    else
        echo "  Unable to fetch data feed statistics"
    fi
    
    # Get recent price updates
    echo ""
    echo "🕐 Recent Price Updates (last 5):"
    curl -s -X POST http://localhost:42069/graphql \
        -H "Content-Type: application/json" \
        -d '{"query": "{ priceUpdates(orderBy: { timestamp: \"desc\" }, limit: 5) { aggregatorAddress formattedPrice timestamp } }"}' | \
        jq -r '.data.priceUpdates[]? | "  \(.aggregatorAddress): \(.formattedPrice) (timestamp: \(.timestamp))"' 2>/dev/null || echo "  No recent price updates found"
    
else
    echo "❌ Ponder API is not responding"
    echo "   Make sure ponder is running: pnpm dev or pnpm supervisor"
fi

echo ""
echo "🔗 Useful URLs:"
echo "  API Health: http://localhost:42069/health"
echo "  GraphQL: http://localhost:42069/graphql"
echo "  Status: http://localhost:42069/status"
echo "  Ready: http://localhost:42069/ready"