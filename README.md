# CodeLens

A VS Code extension for generating and displaying code coverage reports for .NET projects with assembly analysis capabilities and npm dependency graph visualization.

## Features

- Generate coverage reports from dotnet test
- Display HTML reports in VS Code webviews
- Analyze .NET assemblies (DLLs/EXEs) with detailed information
- Visualize npm package dependency graphs with interactive exploration
- Support for xUnit, NUnit, and MSTest frameworks

## Usage

### Code Coverage

1. Open Command Palette (Cmd+Shift+P)
2. Run "CodeLens: Generate Code Coverage Report"
3. View the generated report in VS Code

### Assembly Analysis

1. Right-click any .dll or .exe file
2. Select "View Assembly Information"
3. Explore assembly metadata in an interactive webview

### NPM Dependency Graph

1. Open Command Palette (Cmd+Shift+P)
2. Run "CodeLens: Show NPM Dependency Graph"
3. Enter package names (comma-separated) or use workspace dependencies
4. Choose whether to include devDependencies
5. Explore the interactive dependency graph
6. Click on nodes to open package pages on npmjs.com

![Extension Screenshot](images/extension.png)

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
