#!/bin/bash

# Buoyant installer script
# This makes buoyant work like a real CLI tool

echo "🌊 Installing Buoyant CLI..."

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Make cli.js executable
chmod +x "$SCRIPT_DIR/cli.js"

# Option 1: npm link (recommended for development)
echo "Installing with npm link..."
cd "$SCRIPT_DIR"
npm link

echo "✅ Buoyant installed! You can now use 'buoyant' from anywhere."
echo ""
echo "Try these commands:"
echo "  buoyant report 96815"
echo "  buoyant buoy 51201"
echo "  buoyant --help"
echo ""
echo "To uninstall later, run: npm unlink -g buoyant"
