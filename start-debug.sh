#!/bin/bash
# Quick start for debugging the extension

echo "=========================================="
echo "CodeLens Extension - Debug Mode Setup"
echo "=========================================="
echo ""

# Build the extension first
echo "📦 Building extension in watch mode..."
npm run watch &
WATCH_PID=$!

# Give it a moment to compile
sleep 3

echo ""
echo "✅ Extension ready for debugging!"
echo ""
echo "=========================================="
echo "How to Debug:"
echo "=========================================="
echo ""
echo "1. Press F5 (or Run → Start Debugging)"
echo "   → Opens 'Extension Development Host' window"
echo ""
echo "2. In the new window:"
echo "   → Cmd+Shift+P → 'CodeLens: Show NPM Dependency Graph'"
echo "   → Test all your changes!"
echo ""
echo "3. To reload changes:"
echo "   → Save your code in the original window"
echo "   → In Extension Host: Cmd+Shift+F5 (or Cmd+Shift+P → 'Reload Window')"
echo ""
echo "4. To stop debugging:"
echo "   → Click the red square in the debug toolbar"
echo "   → Or close the Extension Development Host window"
echo ""
echo "=========================================="
echo "Debug Features Available:"
echo "=========================================="
echo ""
echo "✓ Set breakpoints in your TypeScript code"
echo "✓ Use console.log() - output shows in Debug Console"
echo "✓ Hot reload on save (if watch mode is running)"
echo "✓ No need to package or install"
echo "✓ Inspect variables and call stack"
echo ""
echo "Watch mode is running in background (PID: $WATCH_PID)"
echo "Press Ctrl+C to stop watch mode and exit"
echo ""

# Wait for user interrupt
wait $WATCH_PID
