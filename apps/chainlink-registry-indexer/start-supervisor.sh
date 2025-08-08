#!/bin/bash

# Chainlink Registry Supervisor Startup Script

echo "🚀 Starting Chainlink Registry Supervisor..."
echo ""

# Check if .envrc exists
if [ ! -f .envrc ]; then
    echo "❌ .envrc file not found!"
    echo "Please copy .envrc.template to .envrc and add your DRPC_API_KEY"
    exit 1
fi

# Source environment variables
if command -v direnv &> /dev/null; then
    echo "📋 Loading environment with direnv..."
    direnv allow
    eval "$(direnv export bash)"
else
    echo "📋 Loading environment from .envrc..."
    set -a
    source .envrc
    set +a
fi

# Check required environment variables
if [ -z "$DRPC_API_KEY" ]; then
    echo "❌ DRPC_API_KEY not set in .envrc"
    exit 1
fi

echo "✅ Environment loaded"
echo "🔑 DRPC_API_KEY: ${DRPC_API_KEY:0:8}..."
echo ""

# Install dependencies if needed
if [ ! -d node_modules ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Start the supervisor
echo "🤖 Starting supervisor..."
echo "📊 Monitor at: http://localhost:42069"
echo "🛑 Press Ctrl+C to stop"
echo ""

pnpm supervisor