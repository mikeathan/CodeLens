import * as vscode from "vscode";
import { CoverageService } from "./services/coverageService";
import { AssemblyService } from "./services/assemblyService";
import {
  CoverageWebviewProvider,
  AssemblyWebviewProvider,
} from "./providers/webviewProvider";
import { NpmDepsGraphView } from "./views/npmDepsGraphView";

let outputChannel: vscode.OutputChannel;
let coverageService: CoverageService;
let assemblyService: AssemblyService;
let coverageWebviewProvider: CoverageWebviewProvider;
let assemblyWebviewProvider: AssemblyWebviewProvider;
let npmDepsGraphView: NpmDepsGraphView;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("CodeLens");

  // Initialize services
  coverageService = new CoverageService(outputChannel);
  assemblyService = new AssemblyService(outputChannel);
  coverageWebviewProvider = new CoverageWebviewProvider(context);
  assemblyWebviewProvider = new AssemblyWebviewProvider(context);
  npmDepsGraphView = new NpmDepsGraphView(context);

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

  context.subscriptions.push(
    generateCoverage,
    showCoverage,
    runTestsWithCoverage,
    viewAssemblyInfo,
    showAssemblyInfo,
    showNpmDepsGraph,
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
}
