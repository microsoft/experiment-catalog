#!/bin/bash

# Exit on error keeping error code
set -e
echo "Refreshing UI..."

# Navigate to the ui directory
cd ../ui

# Install any dependencies
npm install

# Build the Svelte project
npm run build

# Navigate back to the catalog
cd ../catalog

# Copy the built files to the wwwroot directory
rm -rf wwwroot/
mkdir -p wwwroot/
cp -r ../ui/dist/* wwwroot/

echo "UI refreshed!"
