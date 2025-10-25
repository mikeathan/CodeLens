import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Represents a dependency found in package.json
 */
export interface Dependency {
  name: string;
  version: string;
  type: "dependency" | "devDependency";
}

/**
 * Result of the unused dependency analysis
 */
export interface UnusedDependencyReport {
  unusedDependencies: Dependency[];
  totalDependencies: number;
  scannedFiles: number;
  projectPath: string;
}

/**
 * Service to detect unused dependencies in Node.js projects
 * Follows Single Responsibility Principle by focusing solely on dependency analysis
 */
export class UnusedDependencyDetectorService {
  private readonly IMPORT_PATTERNS = [
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s+.*\s+from\s+['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /import\s+['"]([^'"]+)['"]/g,
  ];

  private readonly SOURCE_EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"];
  private readonly EXCLUDED_DIRS = ["node_modules", "dist", "out", "build", ".git", "coverage"];

  constructor(private outputChannel: vscode.OutputChannel) {}

  /**
   * Analyzes the workspace for unused dependencies
   * @param workspaceUri Optional specific workspace URI to analyze
   */
  async analyzeUnusedDependencies(workspaceUri?: vscode.Uri): Promise<void> {
    const workspaceFolder = workspaceUri
      ? vscode.workspace.getWorkspaceFolder(workspaceUri)
      : vscode.workspace.workspaceFolders?.[0];

    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found. Please open a Node.js project.");
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const packageJsonPath = path.join(workspacePath, "package.json");

    if (!this.fileExists(packageJsonPath)) {
      vscode.window.showErrorMessage("No package.json found in the workspace.");
      return;
    }

    this.outputChannel.show();
    this.logInfo("Starting unused dependency analysis...");
    this.logInfo(`Workspace: ${workspacePath}`);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Analyzing unused dependencies...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 10, message: "Reading package.json..." });
          const report = await this.performAnalysis(workspacePath, packageJsonPath, progress);
          
          this.displayReport(report);
        }
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Performs the actual dependency analysis
   */
  private async performAnalysis(
    workspacePath: string,
    packageJsonPath: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
  ): Promise<UnusedDependencyReport> {
    // Parse package.json
    const dependencies = this.parseDependencies(packageJsonPath);
    this.logInfo(`Found ${dependencies.length} total dependencies`);

    progress.report({ increment: 20, message: "Scanning source files..." });

    // Scan source files for imports
    const usedDependencies = await this.scanSourceFiles(workspacePath);
    this.logInfo(`Found ${usedDependencies.size} used dependencies`);

    progress.report({ increment: 40, message: "Identifying unused dependencies..." });

    // Identify unused dependencies
    const unusedDependencies = this.identifyUnusedDependencies(dependencies, usedDependencies);

    progress.report({ increment: 30, message: "Generating report..." });

    const report: UnusedDependencyReport = {
      unusedDependencies,
      totalDependencies: dependencies.length,
      scannedFiles: this.countSourceFiles(workspacePath),
      projectPath: workspacePath,
    };

    return report;
  }

  /**
   * Parses dependencies from package.json
   */
  private parseDependencies(packageJsonPath: string): Dependency[] {
    const dependencies: Dependency[] = [];

    try {
      const content = fs.readFileSync(packageJsonPath, "utf8");
      const packageJson = JSON.parse(content);

      // Parse regular dependencies
      if (packageJson.dependencies) {
        for (const [name, version] of Object.entries(packageJson.dependencies)) {
          dependencies.push({ name, version: version as string, type: "dependency" });
        }
      }

      // Parse dev dependencies
      if (packageJson.devDependencies) {
        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
          dependencies.push({ name, version: version as string, type: "devDependency" });
        }
      }
    } catch (error) {
      throw new Error(`Failed to parse package.json: ${this.getErrorMessage(error)}`);
    }

    return dependencies;
  }

  /**
   * Scans all source files to find used dependencies
   */
  private async scanSourceFiles(workspacePath: string): Promise<Set<string>> {
    const usedDependencies = new Set<string>();
    const files = this.getAllSourceFiles(workspacePath);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, "utf8");
        const imports = this.extractImports(content);
        
        imports.forEach((imp) => {
          const packageName = this.extractPackageName(imp);
          if (packageName) {
            usedDependencies.add(packageName);
          }
        });
      } catch (error) {
        this.logWarning(`Failed to read file ${file}: ${this.getErrorMessage(error)}`);
      }
    }

    return usedDependencies;
  }

  /**
   * Extracts import/require statements from source code
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];

    for (const pattern of this.IMPORT_PATTERNS) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        imports.push(match[1]);
      }
    }

    return imports;
  }

  /**
   * Extracts the package name from an import path
   * Handles scoped packages (@scope/package) and sub-paths (package/sub/path)
   */
  private extractPackageName(importPath: string): string | null {
    // Skip relative imports
    if (importPath.startsWith(".") || importPath.startsWith("/")) {
      return null;
    }

    // Handle scoped packages (@scope/package)
    if (importPath.startsWith("@")) {
      const parts = importPath.split("/");
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
    }

    // Handle regular packages
    return importPath.split("/")[0];
  }

  /**
   * Identifies which dependencies are not used in the codebase
   */
  private identifyUnusedDependencies(
    allDependencies: Dependency[],
    usedDependencies: Set<string>
  ): Dependency[] {
    return allDependencies.filter((dep) => !usedDependencies.has(dep.name));
  }

  /**
   * Gets all source files in the workspace recursively
   */
  private getAllSourceFiles(dirPath: string, fileList: string[] = []): string[] {
    if (!this.directoryExists(dirPath)) {
      return fileList;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (!this.EXCLUDED_DIRS.includes(entry.name)) {
          this.getAllSourceFiles(fullPath, fileList);
        }
      } else if (entry.isFile()) {
        // Include only source files
        if (this.isSourceFile(entry.name)) {
          fileList.push(fullPath);
        }
      }
    }

    return fileList;
  }

  /**
   * Checks if a file is a source file based on extension
   */
  private isSourceFile(fileName: string): boolean {
    const ext = path.extname(fileName);
    return this.SOURCE_EXTENSIONS.includes(ext);
  }

  /**
   * Counts the total number of source files
   */
  private countSourceFiles(workspacePath: string): number {
    return this.getAllSourceFiles(workspacePath).length;
  }

  /**
   * Displays the analysis report to the user
   */
  private displayReport(report: UnusedDependencyReport): void {
    this.logInfo("\n" + "=".repeat(60));
    this.logInfo("UNUSED DEPENDENCY ANALYSIS REPORT");
    this.logInfo("=".repeat(60));
    this.logInfo(`Project: ${report.projectPath}`);
    this.logInfo(`Total Dependencies: ${report.totalDependencies}`);
    this.logInfo(`Scanned Files: ${report.scannedFiles}`);
    this.logInfo(`Unused Dependencies: ${report.unusedDependencies.length}`);
    this.logInfo("=".repeat(60));

    if (report.unusedDependencies.length === 0) {
      this.logInfo("\n✅ Great! No unused dependencies found.");
      vscode.window.showInformationMessage("No unused dependencies found! 🎉");
    } else {
      this.logInfo("\n⚠️  The following dependencies appear to be unused:\n");

      const regularDeps = report.unusedDependencies.filter((d) => d.type === "dependency");
      const devDeps = report.unusedDependencies.filter((d) => d.type === "devDependency");

      if (regularDeps.length > 0) {
        this.logInfo("Dependencies:");
        regularDeps.forEach((dep) => {
          this.logInfo(`  - ${dep.name} (${dep.version})`);
        });
      }

      if (devDeps.length > 0) {
        this.logInfo("\nDev Dependencies:");
        devDeps.forEach((dep) => {
          this.logInfo(`  - ${dep.name} (${dep.version})`);
        });
      }

      this.logInfo("\n" + "=".repeat(60));

      vscode.window.showWarningMessage(
        `Found ${report.unusedDependencies.length} unused dependencies. Check the output for details.`,
        "Show Output"
      ).then((selection) => {
        if (selection === "Show Output") {
          this.outputChannel.show();
        }
      });
    }
  }

  /**
   * Utility methods for file system operations
   */
  private fileExists(filePath: string): boolean {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  }

  private directoryExists(dirPath: string): boolean {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  }

  /**
   * Logging methods with consistent formatting
   */
  private logInfo(message: string): void {
    this.outputChannel.appendLine(message);
  }

  private logWarning(message: string): void {
    this.outputChannel.appendLine(`⚠️  ${message}`);
  }

  private logError(message: string): void {
    this.outputChannel.appendLine(`❌ ${message}`);
  }

  /**
   * Error handling with proper message extraction
   */
  private handleError(error: unknown): void {
    const errorMessage = this.getErrorMessage(error);
    this.logError(`Analysis failed: ${errorMessage}`);
    vscode.window.showErrorMessage(`Failed to analyze dependencies: ${errorMessage}`);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}