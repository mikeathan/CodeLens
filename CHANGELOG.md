# Change Log

All notable changes to the "CodeLens" extension will be documented in this file.

## [0.1.5] - 2025-10-31

### Added
- **Quick Coverage** command for automatic project/solution detection
- Status bar button for one-click coverage generation
- Keyboard shortcuts:
  - `Cmd+Shift+T` / `Ctrl+Shift+T` - Quick Coverage
  - `Cmd+Shift+R` / `Ctrl+Shift+R` - Show Report
- Editor title button for quick access when viewing .NET files
- "Run Tests with Coverage" option in context menu for .sln/.csproj files
- Icons for all commands in Command Palette

### Improved
- Better error handling with detailed validation messages
- Test project detection now checks before running tests
- Dotnet CLI availability check
- Clear error messages guide users to solutions
- Multi-project selection UI when multiple solutions found

### Refactored
- **Major refactoring**: CoverageService split into 6 focused classes following SOLID principles:
  - `CoverageService` - Orchestrates workflow (240 lines, was 523)
  - `DotnetValidator` - Environment validation (54 lines)
  - `ProjectDiscovery` - Project file discovery (92 lines)
  - `TestRunner` - Test execution (68 lines)
  - `ReportGenerator` - HTML report generation (125 lines)
  - `PathResolver` - File system operations (58 lines)
- **Major refactoring**: UnusedDependencyDetectorService split into 7 focused classes:
  - `UnusedDependencyDetectorService` - Orchestrates workflow (134 lines, was 353)
  - `PackageJsonParser` - Parses package.json (45 lines)
  - `FileScanner` - Scans source files (54 lines)
  - `ImportExtractor` - Extracts imports (58 lines)
  - `DependencyScanner` - Finds used dependencies (44 lines)
  - `DependencyAnalyzer` - Analyzes unused deps (24 lines)
  - `ReportFormatter` - Formats reports (91 lines)
- Improved maintainability, testability, and extensibility
- No breaking changes - APIs remain identical

### Fixed
- Coverage generation now validates .NET workspace before execution
- Proper error logging with stdout/stderr and exit codes
- Test suite syntax corrected (Mocha style)

## [0.1.4] - 2025-10-30

### Added
- Comprehensive test suite for coverage service
- Input validation for all coverage operations

## [0.1.3] - 2025-10-29

### Added
- NPM dependency graph visualization
- Unused dependency detection

## [0.1.0] - 2025-10-28

### Added
- Initial release
- Code coverage report generation for .NET projects
- Assembly analysis for .NET DLLs and EXEs
- HTML report viewing in VS Code webviews
