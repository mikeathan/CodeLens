import * as vscode from "vscode";
import { CoverageService } from "./services/coverageService";
import { AssemblyService } from "./services/assemblyService";
import {
  CoverageWebviewProvider,
  AssemblyWebviewProvider,
} from "./providers/webviewProvider";
import { NpmDepsGraphView } from "./views/npmDepsGraphView";
import { DependenciesInsightsView } from "./views/dependenciesInsightsView";
import { DependenciesInsightsController } from "./controllers/dependenciesInsightsController";

let outputChannel: vscode.OutputChannel;
let coverageService: CoverageService;
let assemblyService: AssemblyService;
let coverageWebviewProvider: CoverageWebviewProvider;
let assemblyWebviewProvider: AssemblyWebviewProvider;
let npmDepsGraphView: NpmDepsGraphView;
let dependenciesInsightsView: DependenciesInsightsView;
let dependenciesInsightsController: DependenciesInsightsController;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("CodeLens");

  // Initialize services
  coverageService = new CoverageService(outputChannel);
  assemblyService = new AssemblyService(outputChannel);
  coverageWebviewProvider = new CoverageWebviewProvider(context);
  assemblyWebviewProvider = new AssemblyWebviewProvider(context);
  npmDepsGraphView = new NpmDepsGraphView(context);

  // Initialize Dependencies Insights
  dependenciesInsightsController = new DependenciesInsightsController(context);
  dependenciesInsightsView = new DependenciesInsightsView(context, dependenciesInsightsController);

  // Register Dependencies Insights WebviewView
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DependenciesInsightsView.viewType,
      dependenciesInsightsView
    )
  );

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

  // Command: Show NPM Dependency Graph (Legacy - redirects to unified view)
  const showNpmDepsGraph = vscode.commands.registerCommand(
    "codelens.showNpmDepsGraph",
    async () => {
      try {
        await dependenciesInsightsView.openTab("graph");
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to show npm dependency graph: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Command: Open Dependencies Insights
  const openDependenciesInsights = vscode.commands.registerCommand(
    "codelens.dependenciesInsights.open",
    async (options?: { tab?: "graph" | "unused" }) => {
      try {
        const tab = options?.tab || "graph";
        await dependenciesInsightsView.openTab(tab);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to open Dependencies Insights: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Command: Detect Unused Dependencies (Legacy - redirects to unified view)
  const detectUnusedDependencies = vscode.commands.registerCommand(
    "codelens.detectUnusedDependencies",
    async () => {
      try {
        await dependenciesInsightsView.openTab("unused");
      } catch (error) {
        vscode.window.showErrorMessage(
          `Failed to detect unused dependencies: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  context.subscriptions.push(
    generateCoverage,
    showCoverage,
    runTestsWithCoverage,
    viewAssemblyInfo,
    showAssemblyInfo,
    showNpmDepsGraph,
    openDependenciesInsights,
    detectUnusedDependencies,
    outputChannel
  );
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
  if (dependenciesInsightsController) {
    dependenciesInsightsController.dispose();
  }
}
