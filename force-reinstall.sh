#!/bin/bash
# Force clean reinstall of CodeLens extension

set -e  # Exit on error

echo "=========================================="
echo "CodeLens Extension - Force Reinstall v0.1.3"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Clean build
echo -e "${YELLOW}[1/6] Cleaning previous build...${NC}"
rm -rf dist/
rm -f codelens-*.vsix
echo "✓ Cleaned"
echo ""

# Step 2: Build production version
echo -e "${YELLOW}[2/6] Building production version...${NC}"
npm run package
echo "✓ Built"
echo ""

# Step 3: Package extension
echo -e "${YELLOW}[3/6] Packaging extension...${NC}"
echo "y" | vsce package 2>&1 | grep -E "DONE|Packaged|WARNING" || true
echo "✓ Packaged"
echo ""

# Step 4: Uninstall ALL versions
echo -e "${YELLOW}[4/6] Uninstalling all previous versions...${NC}"
code --list-extensions | grep -i codelens | while read ext; do
    echo "  Uninstalling $ext..."
    code --uninstall-extension "$ext" 2>/dev/null || true
done
echo "✓ Uninstalled"
echo ""

# Step 5: Install new version
echo -e "${YELLOW}[5/6] Installing new version (v0.1.3)...${NC}"
VSIX_FILE=$(ls -t codelens-*.vsix | head -1)
if [ -f "$VSIX_FILE" ]; then
    code --install-extension "$VSIX_FILE" --force
    echo "✓ Installed: $VSIX_FILE"
else
    echo -e "${RED}✗ VSIX file not found!${NC}"
    exit 1
fi
echo ""

# Step 6: Final instructions
echo -e "${GREEN}=========================================="
echo "Installation Complete!"
echo "==========================================${NC}"
echo ""
echo -e "${RED}⚠️  CRITICAL: You MUST restart VS Code completely!${NC}"
echo ""
echo "Steps to restart VS Code:"
echo "  1. Close ALL VS Code windows"
echo "  2. Quit VS Code completely (Cmd+Q or Ctrl+Q)"
echo "  3. Reopen VS Code"
echo ""
echo "Then test with:"
echo "  • Open Command Palette (Cmd+Shift+P)"
echo "  • Run: 'CodeLens: Show NPM Dependency Graph'"
echo ""
echo -e "${GREEN}Expected behavior:${NC}"
echo "  ✓ No auto-generation on open"
echo "  ✓ Shows package selection UI"
echo "  ✓ 'Update Graph' button to manually trigger"
echo "  ✓ 'Stop' button appears during generation"
echo "  ✓ Extension icon in the panel tab"
echo ""
