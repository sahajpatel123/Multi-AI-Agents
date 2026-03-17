#!/bin/bash

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 1: Check versions"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Node version:"
node --version
echo "npm version:"
npm --version
echo "Vite version from package.json:"
cat package.json | grep '"vite"'

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "STEP 2: Full clean reinstall"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Removing node_modules..."
rm -rf node_modules
echo "Removing dist..."
rm -rf dist
echo "Removing .vite cache..."
rm -rf .vite
echo "Removing package-lock.json..."
rm -f package-lock.json
echo "Cleaning npm cache..."
npm cache clean --force
echo "Installing dependencies..."
npm install

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Clean reinstall complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Now run: npm run dev"
echo "Then open browser at: http://localhost:5173"
echo ""
echo "Expected results:"
echo "- If page turns RED: CSS is loading, content issue"
echo "- If page is WHITE: Check browser console and network tab"
echo "- If 'ROOT NOT FOUND' appears: HTML/script loading issue"
