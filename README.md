# CodeLens

A VS Code extension for generating and displaying code coverage reports for .NET projects with assembly analysis capabilities and npm dependency graph visualization.

## Features

- Generate coverage reports from dotnet test
- Display HTML reports in VS Code webviews
- Analyze .NET assemblies (DLLs/EXEs) with detailed information
- Visualize npm package dependency graphs with interactive exploration
- Support for xUnit, NUnit, and MSTest frameworks
- Quick access via status bar, keyboard shortcuts, and context menus

## Usage

### Code Coverage - Multiple Ways to Access

#### 1. **Quick Coverage (Recommended)** 🚀
- **Click the status bar**: Click the "$(beaker) Coverage" button in the bottom-left status bar
- **Keyboard shortcut**: Press `Cmd+Shift+T` (Mac) or `Ctrl+Shift+T` (Windows/Linux) while in a C# file
- **Editor button**: Click the lightning bolt icon in the top-right when viewing .cs, .csproj, or .sln files
- Automatically detects your project/solution and generates coverage
- Prompts you to select if multiple solutions/projects are found

#### 2. **Right-Click Context Menu**
- Right-click any `.sln` or `.csproj` file in the Explorer
- Select "Generate Code Coverage Report" for targeted coverage
- Select "Run Tests with Coverage" to just run tests

#### 3. **Command Palette**
- Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
- Run "CodeLens: Quick Coverage (Auto-detect Project)" - smart detection
- Run "CodeLens: Generate Code Coverage Report" - full control
- Run "CodeLens: Run Tests with Coverage" - tests only

#### 4. **View Reports**
- Use `Cmd+Shift+R` / `Ctrl+Shift+R` to quickly open the latest report
- Or run "CodeLens: Show Code Coverage Report" from Command Palette

### Assembly Analysis

1. Right-click any .dll or .exe file
2. Select "View Assembly Information"
3. Explore assembly metadata in an interactive webview

### NPM Dependency Graph

1. Open Command Palette (Cmd+Shift+P)
2. Run "CodeLens: Show NPM Dependency Graph"
3. Use the sidebar filters to include or exclude dependency types
4. Select individual packages or press **Select All** to graph everything
5. Click **Update Graph** to rebuild the visualization with your selection
6. Explore the interactive dependency graph and click nodes to open the package page on npmjs.com

## Keyboard Shortcuts

| Command | Mac | Windows/Linux | Description |
|---------|-----|---------------|-------------|
| Quick Coverage | `Cmd+Shift+T` | `Ctrl+Shift+T` | Generate coverage report (auto-detect project) |
| Show Report | `Cmd+Shift+R` | `Ctrl+Shift+R` | Open the latest coverage report |

*Note: Quick Coverage shortcut only works when editing C# files*

## Project Architecture

The extension has been refactored into a modular architecture for better maintainability and readability:

```
src/
├── extension.ts              # Main extension entry point with command registration
├── services/
│   ├── coverageService.ts    # Coverage generation and report management
│   └── assemblyService.ts    # Assembly analysis functionality
├── providers/
│   └── webviewProvider.ts    # Webview creation and management
└── utils/
    └── index.ts              # Shared utility functions
```

### Key Components

- **CoverageService**: Handles all coverage-related operations including test execution, report generation, and ReportGenerator tool management
- **AssemblyService**: Manages .NET assembly analysis using reflection and fallback methods
- **WebviewProvider**: Creates and manages VS Code webview panels for displaying reports and assembly information
- **Utilities**: Common functions for file operations, project discovery, and validation

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [VS Code](https://code.visualstudio.com/)
- [.NET SDK](https://dotnet.microsoft.com/download) (for testing coverage features)

### Setup

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

### Install Local Extension

#### Method 1: Using Command Palette

1. Open VS Code
2. Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS)
3. Type "Extensions: Install from VSIX"
4. Select the generated `.vsix` file

#### Method 2: Using CLI

```bash
code --install-extension codelens-<version>.vsix
```

### Development Workflow

1. Make changes to the source code
2. Run `npm run compile` to build
3. Press `F5` in VS Code to launch Extension Development Host
4. Test your changes in the new VS Code window
5. Use `Ctrl+Shift+F5` to reload the extension after changes

### Available Scripts

- `npm run compile` - Full build with type checking and linting
- `npm run watch` - Watch mode for development
- `npm run package` - Production build
- `npm run check-types` - TypeScript type checking only
- `npm run lint` - ESLint code quality check
- `npm run compile-tests` - Compile test files
- `npm run watch-tests` - Watch mode for tests
- `npm test` - Run all tests

## License

MIT
