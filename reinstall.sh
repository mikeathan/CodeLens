#!/bin/bash
# Script to uninstall old version and install new CodeLens extension

echo "=== CodeLens Extension Reinstall Script ==="
echo ""

# Step 1: Uninstall old version
echo "Step 1: Uninstalling old version..."
code --uninstall-extension mikeathan.codelens 2>/dev/null || echo "No previous version found (this is okay)"
echo ""

# Step 2: Install new version
echo "Step 2: Installing new version from VSIX..."
code --install-extension codelens-0.1.2.vsix
echo ""

echo "=== Installation Complete! ==="
echo ""
echo "⚠️  IMPORTANT: Please reload/restart VS Code for changes to take effect!"
echo ""
echo "To test the npm dependency graph viewer:"
echo "  1. Reload VS Code window (Cmd+Shift+P -> 'Reload Window')"
echo "  2. Open Command Palette (Cmd+Shift+P)"
echo "  3. Run 'CodeLens: Show NPM Dependency Graph'"
echo "  4. The viewer should now:"
echo "     - NOT auto-generate the graph on open"
echo "     - Show a 'Stop' button when generating"
echo "     - Display the extension icon in the panel tab"
echo ""
