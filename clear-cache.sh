#!/bin/bash
# Nuclear option - completely clean VS Code extension cache

echo "=========================================="
echo "VS Code Extension Cache Cleaner"
echo "=========================================="
echo ""

# Find VS Code extension directories
VSCODE_EXTENSIONS_DIRS=(
    "$HOME/.vscode/extensions"
    "$HOME/.vscode-server/extensions"
    "$HOME/Library/Application Support/Code/User/workspaceStorage"
)

echo "🗑️  Removing all CodeLens extension versions..."
echo ""

for dir in "${VSCODE_EXTENSIONS_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "Checking: $dir"
        find "$dir" -type d -name "*codelens*" -o -name "*mikeathan.codelens*" 2>/dev/null | while read ext_dir; do
            echo "  Removing: $ext_dir"
            rm -rf "$ext_dir"
        done
    fi
done

echo ""
echo "✓ Extension cache cleared"
echo ""
echo "Now run: ./force-reinstall.sh"
echo ""
