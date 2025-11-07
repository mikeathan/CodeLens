# CodeLens

[![Version](https://img.shields.io/badge/version-0.1.6-blue.svg)](https://github.com/mikeathan/CodeLens)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.105.0+-0078d7.svg)](https://code.visualstudio.com/)

> **Developer productivity toolkit for .NET and Node.js projects**  
> Analyze code coverage, inspect assemblies, and visualize dependencies—all within VS Code.

---

## ✨ Features at a Glance

| Feature                  | Description                                                        | Quick Access   |
| ------------------------ | ------------------------------------------------------------------ | -------------- |
| 🎯 **Code Coverage**     | Generate and view detailed HTML coverage reports for .NET projects | `Ctrl+Shift+C` |
| 🔍 **Assembly Analysis** | Inspect .NET assemblies with full type and method information      | `Ctrl+Shift+A` |
| 📦 **NPM Dependencies**  | Interactive graph visualization of your Node.js dependencies       | `Ctrl+Shift+D` |

---

## 🚀 Quick Start

### 1️⃣ Code Coverage for .NET Projects

**Generate comprehensive coverage reports with one keystroke:**

- **Keyboard**: `Ctrl+Shift+C` (or `Cmd+Shift+C` on macOS)
- **Status Bar**: Click "Generate Coverage" button
- **Command Palette**: `Ctrl+Shift+P` → "Generate Code Coverage Report"
- **Context Menu**: Right-click `.sln` or `.csproj` file → "Generate Code Coverage Report"

**Features:**

- ✅ Detailed HTML reports with line, branch, and method coverage
- ✅ Supports xUnit, NUnit, MSTest
- ✅ Real-time progress tracking
- ✅ Automatic project detection

---

### 2️⃣ Assembly Analysis


**Inspect any .NET assembly (DLL/EXE) with detailed metadata:**

- **Context Menu**: Right-click any `.dll` or `.exe` → "View Assembly Information"
- **Keyboard**: `Ctrl+Shift+A` (or `Cmd+Shift+A` on macOS)
- **Command Palette**: `Ctrl+Shift+P` → "Analyze .NET Assembly"

**What you'll see:**

- 📋 Types, methods, properties, and fields
- 🏷️ Attributes and metadata
- 🔗 Type hierarchies and relationships
- 📝 Complete method signatures

---

### 3️⃣ NPM Dependency Graph

**Visualize your Node.js project dependencies interactively:**

- **Keyboard**: `Ctrl+Shift+D` (or `Cmd+Shift+D` on macOS)
- **Command Palette**: `Ctrl+Shift+P` → "Show NPM Dependency Graph"

**Features:**

- 🌳 Hierarchical tree visualization
- 🔍 Search and filter packages
- 🎨 Toggle production/development dependencies
- 🖱️ Interactive zoom and navigation
- ⏸️ Stop generation for large graphs

---

## 📋 All Commands

| Command                       | Shortcut (Win/Linux) | Shortcut (macOS) | Description                     |
| ----------------------------- | -------------------- | ---------------- | ------------------------------- |
| Generate Code Coverage Report | `Ctrl+Shift+C`       | `Cmd+Shift+C`    | Run tests and generate coverage |
| Show Code Coverage Report     | `Ctrl+Shift+R`       | `Cmd+Shift+R`    | View latest coverage report     |
| Analyze .NET Assembly         | `Ctrl+Shift+A`       | `Cmd+Shift+A`    | Inspect assembly metadata       |
| Show NPM Dependency Graph     | `Ctrl+Shift+D`       | `Cmd+Shift+D`    | Visualize npm dependencies      |

---

## ��️ Requirements

- **For Code Coverage**:
  - .NET SDK (6.0 or higher recommended)
  - One of: xUnit, NUnit, or MSTest test framework
- **For Assembly Analysis**:

  - .NET SDK with reflection capabilities

- **For NPM Dependencies**:
  - Node.js project with `package.json`

---

## 📖 Detailed Usage

### Code Coverage - Step by Step

1. **Open a .NET project** in VS Code
2. Press `Ctrl+Shift+C` to generate coverage
3. Watch the progress in the notification
4. View the interactive HTML report in a webview
5. Use `Ctrl+Shift+R` to reopen the report anytime

**Advanced Options:**

- Right-click specific `.csproj` for targeted coverage
- Run "Run Tests with Coverage" for test-only execution
- Status bar shows quick access button when in .NET projects

### Assembly Analysis - Step by Step

1. **Locate a .NET assembly** (.dll or .exe) in your workspace
2. Right-click the file → "View Assembly Information"
3. Explore types, methods, and metadata in the interactive viewer
4. Search and filter using the built-in search box

### NPM Dependency Graph - Step by Step

1. **Open a Node.js project** with `package.json`
2. Press `Ctrl+Shift+D` to open the graph viewer
3. Click "Generate Graph" to visualize dependencies
4. Use filters to show/hide production or development deps
5. Search for specific packages
6. Click nodes to see details
7. Use mouse to zoom and pan the graph

---

## 🏗️ Extension Architecture

CodeLens is built with a modular architecture for maintainability and extensibility:

```
src/
├── extension.ts              # Main entry point
├── services/
│   ├── coverageService.ts    # Coverage generation logic
│   ├── assemblyService.ts    # Assembly analysis logic
│   └── npmDependenciesService.ts  # NPM graph logic
├── providers/
│   └── webviewProvider.ts    # Webview management
├── views/
│   ├── coverageReportView.ts # Coverage HTML rendering
│   ├── assemblyInfoView.ts   # Assembly viewer
│   └── npmDepsGraphView.ts   # Dependency graph UI
└── utils/
    └── index.ts              # Shared utilities
```

**Key Design Principles:**

- 🔌 **Modular**: Each feature in its own service
- 🧪 **Testable**: Logic separated from VS Code API
- 📦 **Bundled**: Optimized with esbuild for fast activation
- 🎨 **User-Friendly**: Multiple access points for every feature

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

### Development Setup

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd CodeLens
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Building the Extension

#### Development Build

```bash
npm run compile
```

This command:

- Runs TypeScript type checking (`tsc --noEmit`)
- Executes ESLint for code quality
- Builds the extension using esbuild

#### Watch Mode (for development)

```bash
npm run watch
```

This starts both TypeScript and esbuild in watch mode for automatic rebuilding during development.

#### Production Build

```bash
npm run package
```

This creates an optimized production build with:

- Type checking
- Linting
- Minification and bundling optimizations

### Testing

#### Compile Tests

```bash
npm run compile-tests
```

#### Run Tests

```bash
npm test
```

### Development Workflow

1. Make changes to the source code
2. Run `npm run compile` to build
3. Press `F5` in VS Code to launch Extension Development Host
4. Test your changes in the new VS Code window
5. Use `Ctrl+Shift+F5` to reload the extension after changes

### Package Extension

To create a `.vsix` package for distribution:

1. Install the VS Code Extension Manager CLI:

   ```bash
   npm install -g @vscode/vsce
   ```

2. Package the extension:
   ```bash
   vsce package
   ```

This creates a `codelens-<version>.vsix` file that can be installed in VS Code.

### Available Scripts

- `npm run compile` - Full build with type checking and linting
- `npm run watch` - Watch mode for development
- `npm run package` - Production build
- `npm run check-types` - TypeScript type checking only
- `npm run lint` - ESLint code quality check
- `npm run compile-tests` - Compile test files
- `npm run watch-tests` - Watch mode for tests
- `npm test` - Run all tests

---

## 📄 License

MIT © 2024

---

## 🐛 Issues & Feedback

Found a bug or have a feature request? Please [open an issue](https://github.com/mikeathan/CodeLens/issues) on GitHub.

---

## 🌟 Show Your Support

If you find CodeLens helpful, please consider:

- ⭐ Starring the repository
- 📢 Sharing with your team
- 🐛 Reporting bugs or suggesting features
- 🤝 Contributing code improvements
