import * as vscode from "vscode";
import { CoverageService } from "./services/coverage";
import { AssemblyService } from "./services/assemblyService";
import {
  CoverageWebviewProvider,
  AssemblyWebviewProvider,
} from "./providers/webviewProvider";
import { NpmDepsGraphView } from "./views/npmDepsGraphView";
import { UnusedDependencyDetectorService } from "./services/dependency";

let outputChannel: vscode.OutputChannel;
let coverageService: CoverageService;
let assemblyService: AssemblyService;
let coverageWebviewProvider: CoverageWebviewProvider;
let assemblyWebviewProvider: AssemblyWebviewProvider;
let npmDepsGraphView: NpmDepsGraphView;
let unusedDependencyService: UnusedDependencyDetectorService;
let statusBarItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("CodeLens");

  // Initialize services
  coverageService = new CoverageService(outputChannel);
  assemblyService = new AssemblyService(outputChannel);
  coverageWebviewProvider = new CoverageWebviewProvider(context);
  assemblyWebviewProvider = new AssemblyWebviewProvider(context);
  npmDepsGraphView = new NpmDepsGraphView(context);
  unusedDependencyService = new UnusedDependencyDetectorService(outputChannel);

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = "$(beaker) Coverage";
  statusBarItem.tooltip = "Click to generate code coverage report";
  statusBarItem.command = "dotnet-coverage.quickCoverage";
  
  // Show status bar item only in .NET workspaces
  updateStatusBarVisibility();
  
  // Update status bar when active editor changes
  vscode.window.onDidChangeActiveTextEditor(() => {
    updateStatusBarVisibility();
  });

  console.log("CodeLens is now active!");

  // Command: Generate Coverage Report
  const generateCoverage = vscode.commands.registerCommand(
    "dotnet-coverage.generateReport",
    async (uri?: vscode.Uri) => {
      await coverageService.generateReport(context, uri);
    }
  );

  // Command: Show Coverage Report
  const showCoverage = vscode.commands.registerCommand(
    "dotnet-coverage.showReport",
    async () => {
      await coverageWebviewProvider.showCoverageReport();
    }
  );

  // Command: Run Tests with Coverage
  const runTestsWithCoverage = vscode.commands.registerCommand(
    "dotnet-coverage.runTests",
    async () => {
      await coverageService.runTestsWithCoverage();
    }
  );

  // Command: Quick Coverage (auto-detect and generate)
  const quickCoverage = vscode.commands.registerCommand(
    "dotnet-coverage.quickCoverage",
    async () => {
      await coverageService.quickCoverage(context);
    }
  );

  // Command: View Assembly Information
  const viewAssemblyInfo = vscode.commands.registerCommand(
    "dotnet-coverage.viewAssemblyInfo",
    async (uri?: vscode.Uri) => {
      await assemblyService.analyzeAssembly(context, uri);
    }
  );

  // Internal command for showing assembly info in webview
  const showAssemblyInfo = vscode.commands.registerCommand(
    "codelens.showAssemblyInfo",
    (assemblyPath: string, assemblyInfo: string) => {
      assemblyWebviewProvider.showAssemblyInfo(assemblyPath, assemblyInfo);
    }
  );

  // Command: Show NPM Dependency Graph
  const showNpmDepsGraph = vscode.commands.registerCommand(
    "codelens.showNpmDepsGraph",
    async () => {
      try {
        await npmDepsGraphView.show();
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to show npm dependency graph: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Command: Detect Unused Dependencies
  const detectUnusedDeps = vscode.commands.registerCommand(
    "codelens.detectUnusedDependencies",
    async (uri?: vscode.Uri) => {
      await unusedDependencyService.analyzeUnusedDependencies(uri);
    }
  );

  context.subscriptions.push(
    generateCoverage,
    showCoverage,
    runTestsWithCoverage,
    quickCoverage,
    viewAssemblyInfo,
    showAssemblyInfo,
    showNpmDepsGraph,
    detectUnusedDeps,
    outputChannel,
    statusBarItem
  );
}

// Helper function to check if current workspace has .NET projects
function updateStatusBarVisibility() {
  const editor = vscode.window.activeTextEditor;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  
  if (!workspaceFolder) {
    statusBarItem.hide();
    return;
  }

  // Show if editing C# file or if workspace has .csproj/.sln files
  if (editor?.document.languageId === "csharp") {
    statusBarItem.show();
  } else {
    // Check if workspace has .NET project files
    vscode.workspace.findFiles("**/*.{csproj,sln}", "**/node_modules/**", 1).then(files => {
      if (files.length > 0) {
        statusBarItem.show();
      } else {
        statusBarItem.hide();
      }
    });
  }
}

export function deactivate() {
  if (outputChannel) {
    outputChannel.dispose();
  }
  if (coverageWebviewProvider) {
    coverageWebviewProvider.dispose();
  }
  if (assemblyWebviewProvider) {
    assemblyWebviewProvider.dispose();
  }
  if (npmDepsGraphView) {
    npmDepsGraphView.dispose();
  }
}