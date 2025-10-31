import * as vscode from "vscode";
import { PackageJsonParser } from "./PackageJsonParser";
import { DependencyScanner } from "./DependencyScanner";
import { DependencyAnalyzer } from "./DependencyAnalyzer";
import { ReportFormatter } from "./ReportFormatter";
import { Dependency, UnusedDependencyReport } from "./types";

/**
 * Orchestrates unused dependency detection
 * Single Responsibility: Coordinates the analysis workflow
 * Follows Dependency Inversion: Depends on abstractions (injected dependencies)
 */
export class UnusedDependencyDetectorService {
  private packageParser: PackageJsonParser;
  private dependencyScanner: DependencyScanner;
  private dependencyAnalyzer: DependencyAnalyzer;
  private reportFormatter: ReportFormatter;

  constructor(private outputChannel: vscode.OutputChannel) {
    this.packageParser = new PackageJsonParser();
    this.dependencyScanner = new DependencyScanner(outputChannel);
    this.dependencyAnalyzer = new DependencyAnalyzer();
    this.reportFormatter = new ReportFormatter(outputChannel);
  }

  /**
   * Analyzes the workspace for unused dependencies
   * @param workspaceUri Optional specific workspace URI to analyze
   */
  async analyzeUnusedDependencies(workspaceUri?: vscode.Uri): Promise<void> {
    const workspaceFolder = this.resolveWorkspaceFolder(workspaceUri);

    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "No workspace folder found. Please open a Node.js project."
      );
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    const packageJsonPath = this.packageParser.getPackageJsonPath(workspacePath);

    if (!this.packageParser.exists(packageJsonPath)) {
      vscode.window.showErrorMessage("No package.json found in the workspace.");
      return;
    }

    this.outputChannel.show();
    this.reportFormatter.logInfo("Starting unused dependency analysis...");
    this.reportFormatter.logInfo(`Workspace: ${workspacePath}`);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Analyzing unused dependencies...",
          cancellable: false,
        },
        async (progress) => {
          const report = await this.performAnalysis(
            workspacePath,
            packageJsonPath,
            progress
          );
          this.reportFormatter.displayReport(report);
        }
      );
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Public method for testing - identifies unused dependencies
   */
  public identifyUnusedDependencies(
    allDependencies: Dependency[],
    usedDependencies: Set<string>
  ): Dependency[] {
    return this.dependencyAnalyzer.identifyUnusedDependencies(
      allDependencies,
      usedDependencies
    );
  }

  private async performAnalysis(
    workspacePath: string,
    packageJsonPath: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
  ): Promise<UnusedDependencyReport> {
    // Parse package.json
    progress.report({ increment: 10, message: "Reading package.json..." });
    const dependencies = this.packageParser.parseDependencies(packageJsonPath);
    this.reportFormatter.logInfo(`Found ${dependencies.length} total dependencies`);

    // Scan source files for imports
    progress.report({ increment: 20, message: "Scanning source files..." });
    const usedDependencies = await this.dependencyScanner.scanForUsedDependencies(
      workspacePath
    );
    this.reportFormatter.logInfo(`Found ${usedDependencies.size} used dependencies`);

    // Identify unused dependencies
    progress.report({ increment: 40, message: "Identifying unused dependencies..." });
    const unusedDependencies = this.dependencyAnalyzer.identifyUnusedDependencies(
      dependencies,
      usedDependencies
    );

    // Generate report
    progress.report({ increment: 30, message: "Generating report..." });
    const report: UnusedDependencyReport = {
      unusedDependencies,
      totalDependencies: dependencies.length,
      scannedFiles: this.dependencyScanner.getScannedFileCount(workspacePath),
      projectPath: workspacePath,
    };

    return report;
  }

  private resolveWorkspaceFolder(
    workspaceUri?: vscode.Uri
  ): vscode.WorkspaceFolder | undefined {
    return workspaceUri
      ? vscode.workspace.getWorkspaceFolder(workspaceUri)
      : vscode.workspace.workspaceFolders?.[0];
  }

  private handleError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.reportFormatter.showError(errorMessage);
  }
}
