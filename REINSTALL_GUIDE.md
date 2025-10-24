# 🚨 COMPLETE REINSTALLATION GUIDE 🚨

## The Problem
VS Code aggressively caches extensions. Simply installing a new version doesn't always reload the code properly.

## The Solution: Nuclear Reinstall

### **Step 1: Close VS Code Completely**
```bash
# Make sure NO VS Code windows are open
# On Mac: Cmd+Q
# On Linux/Windows: Ctrl+Q or close all windows
```

### **Step 2: Clear Extension Cache (Optional but Recommended)**
```bash
cd /home/mikeathan/dev/CodeLens
./clear-cache.sh
```

### **Step 3: Force Reinstall**
```bash
cd /home/mikeathan/dev/CodeLens
./force-reinstall.sh
```

This will:
- ✓ Clean build the extension
- ✓ Package version 0.1.3
- ✓ Uninstall all old versions
- ✓ Install the new version

### **Step 4: START VS Code (Fresh Start)**
```bash
code .
```

### **Step 5: Verify Installation**

1. Open Command Palette: `Cmd+Shift+P` (or `Ctrl+Shift+P`)
2. Type: `Extensions: Show Installed Extensions`
3. Find "CodeLens" - should show version **0.1.3**
4. If it shows an older version, restart VS Code again

### **Step 6: Test the NPM Dependency Graph**

1. Open Command Palette: `Cmd+Shift+P`
2. Run: `CodeLens: Show NPM Dependency Graph`

**You should see:**
- ✅ **Package selection UI appears first**
- ✅ **NO automatic graph generation**
- ✅ **"Update Graph" button visible**
- ✅ **Status message: "Select packages and click 'Update Graph' to visualize dependencies."**

3. Select some packages
4. Click "Update Graph"

**During generation you should see:**
- ✅ **"Stop" button appears**
- ✅ **"Update Graph" and "Refresh Data" buttons are disabled**
- ✅ **Status message shows progress**

5. Click "Stop" to test cancellation

**After stopping:**
- ✅ **"Stop" button disappears**
- ✅ **Other buttons become enabled again**
- ✅ **Message confirms operation was stopped**

---

## If It STILL Doesn't Work

### Last Resort Options:

#### Option A: Development Host Testing
Instead of installing the extension, run it in development mode:

1. Open VS Code in the project:
   ```bash
   cd /home/mikeathan/dev/CodeLens
   code .
   ```

2. Press **F5** to launch Extension Development Host
3. In the new window, test the command
4. This uses the source code directly, bypassing any cache issues

#### Option B: Check What's Actually Installed
```bash
# List all installed extensions
code --list-extensions --show-versions | grep -i codelens

# Uninstall by exact ID
code --uninstall-extension mikeathan.codelens

# Or if it has a different ID
code --uninstall-extension codelens
```

#### Option C: Manual Extension Folder Inspection
```bash
# Find where extensions are installed
ls -la ~/.vscode/extensions/ | grep -i codelens

# Remove manually if needed
rm -rf ~/.vscode/extensions/mikeathan.codelens-*
rm -rf ~/.vscode/extensions/*codelens*
```

---

## Verification Checklist

Run through this checklist to confirm everything works:

- [ ] Extension version shows as **0.1.3** in Extensions view
- [ ] Opening NPM Dependency Graph does NOT auto-generate
- [ ] Package selection UI appears first
- [ ] "Update Graph" button is present
- [ ] Clicking "Update Graph" starts the generation
- [ ] "Stop" button appears during generation
- [ ] "Stop" button is hidden when not generating
- [ ] Clicking "Stop" cancels the operation
- [ ] Extension icon appears in the panel tab
- [ ] No duplicate nodes when generating multiple times

---

## Changes in v0.1.3

1. **No auto-generation on open** - Graph only generates when you click "Update Graph"
2. **Stop button** - Cancel long-running graph generation operations
3. **Fixed graph stacking** - Nodes properly clear before redrawing
4. **Panel icon** - Extension icon shows in the panel tab
5. **Better state management** - Buttons enable/disable appropriately
6. **Clear status messages** - User always knows what's happening

---

## Files Created

- `LICENSE` - MIT License for the extension
- `force-reinstall.sh` - Automated clean reinstall script
- `clear-cache.sh` - Clear VS Code extension cache
- `REINSTALL_GUIDE.md` - This guide

---

## Still Having Issues?

If after following ALL steps above it still doesn't work, the problem might be:

1. **VS Code hasn't restarted** - Must fully quit and reopen
2. **Multiple VS Code versions** - Check if you have VS Code Insiders or regular VS Code
3. **Extension ID mismatch** - The extension might be installed under a different ID
4. **Workspace settings** - Check `.vscode/settings.json` for extension-specific overrides

Run development mode (F5) as a definitive test - if it works there but not when installed, it's a VS Code caching issue.
