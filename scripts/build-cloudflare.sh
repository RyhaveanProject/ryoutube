#!/bin/sh
# Cloudflare Pages build helper
# Cloudflare Pages will run: npm run build (after setting env vars)
# This script ensures correct env wiring.
set -e
cd frontend
yarn install --frozen-lockfile
yarn build
echo "Build complete -> frontend/build"
