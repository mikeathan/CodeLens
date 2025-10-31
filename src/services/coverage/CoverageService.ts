import * as vscode from "vscode";
import { findCoverageFiles } from "../../utils";
import { DotnetValidator } from "./DotnetValidator";
import { ProjectDiscovery } from "./ProjectDiscovery";
import { TestRunner } from "./TestRunner";
import { ReportGenerator } from "./ReportGenerator";
import { PathResolver } from "./PathResolver";

/**
 * Orchestrates code coverage operations
 */
export class CoverageService {
  private validator: DotnetValidator;
  private projectDiscovery: ProjectDiscovery;
  private testRunner: TestRunner;
  private reportGenerator: ReportGenerator;
  private pathResolver: PathResolver;

  constructor(private outputChannel: vscode.OutputChannel) {
    this.validator = new DotnetValidator();
    this.projectDiscovery = new ProjectDiscovery();
    this.testRunner = new TestRunner(outputChannel);
    this.reportGenerator = new ReportGenerator(outputChannel);
    this.pathResolver = new PathResolver();
  }

  async generateReport(
    context: vscode.ExtensionContext,
    targetUri?: vscode.Uri
  ): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!await this.validator.validateWorkspace(workspaceFolder)) {
      this.validator.showNoWorkspaceError();
      return;
    }

    const workspacePath = workspaceFolder!.uri.fsPath;
    const { targetPath, targetDir } = this.pathResolver.resolveTargetPath(
      targetUri,
      workspacePath
    );

    if (!await this.validator.validateDotnetInstalled()) {
      this.validator.showNoDotnetError();
      return;
    }

    this.outputChannel.show();
    this.logGenerationStart(workspacePath, targetPath);

    try {
      const testProjects = await this.validator.validateTestProjectsExist(
        workspacePath
      );
      
      if (testProjects.length === 0) {
        vscode.window.showWarningMessage(
          "No test projects found in the workspace."
        );
        return;
      }

      this.outputChannel.appendLine(
        `Found ${testProjects.length} test project(s)`
      );

      await this.executeTestsAndGenerateReport(
        targetPath,
        targetDir,
        workspacePath
      );
    } catch (error) {
      this.handleError(error, "Failed to generate coverage report");
    }
  }

  async runTestsWithCoverage(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!await this.validator.validateWorkspace(workspaceFolder)) {
      this.validator.showNoWorkspaceError();
      return;
    }

    const workspacePath = workspaceFolder!.uri.fsPath;

    if (!await this.validator.validateDotnetInstalled()) {
      this.validator.showNoDotnetError();
      return;
    }

    const testProjects = await this.validator.validateTestProjectsExist(
      workspacePath
    );
    
    if (testProjects.length === 0) {
      this.validator.showNoTestProjectsError();
      return;
    }

    this.outputChannel.show();
    this.outputChannel.appendLine(
      `Found ${testProjects.length} test project(s): ${testProjects.join(", ")}`
    );
    this.outputChannel.appendLine("Running tests with coverage...");

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running tests...",
          cancellable: false,
        },
        async () => {
          const command = this.testRunner.buildSimpleTestCommand();
          await this.testRunner.runTests(command, workspacePath);

          vscode.window.showInformationMessage(
            "Tests completed. Generate report to view coverage."
          );
        }
      );
    } catch (error) {
      this.handleError(error, "Failed to run tests");
    }
  }

  async quickCoverage(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    
    if (!await this.validator.validateWorkspace(workspaceFolder)) {
      this.validator.showNoWorkspaceError();
      return;
    }

    const workspacePath = workspaceFolder!.uri.fsPath;

    if (!await this.validator.validateDotnetInstalled()) {
      this.validator.showNoDotnetError();
      return;
    }

    this.outputChannel.show();
    this.outputChannel.appendLine("Quick Coverage: Auto-detecting projects...");

    try {
      const projectInfo = await this.projectDiscovery.selectProject(
        workspacePath
      );

      if (!projectInfo) {
        this.projectDiscovery.showNoProjectsWarning();
        return;
      }

      this.outputChannel.appendLine(`Found: ${projectInfo.name}`);

      const testProjects = await this.validator.validateTestProjectsExist(
        workspacePath
      );
      
      if (testProjects.length === 0) {
        this.validator.showNoTestProjectsWarning(projectInfo.name);
        return;
      }

      this.outputChannel.appendLine(
        `Generating coverage report for: ${projectInfo.name}`
      );

      await this.generateReport(context, projectInfo.uri);
    } catch (error) {
      this.handleError(error, "Quick Coverage failed");
    }
  }

  getCoverageReportPath(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    return this.pathResolver.getCoverageReportPath(
      workspaceFolder.uri.fsPath
    );
  }

  private async executeTestsAndGenerateReport(
    targetPath: string | undefined,
    targetDir: string,
    workspacePath: string
  ): Promise<void> {
    const coverageDir = this.pathResolver.ensureCoverageDirectoryExists(
      workspacePath
    );

    this.outputChannel.appendLine(
      "Running dotnet test with coverage collection..."
    );

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Generating coverage report...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 0 });

        const command = this.testRunner.buildTestCommand(
          targetPath,
          coverageDir
        );
        await this.testRunner.runTests(command, targetDir);

        progress.report({ increment: 50 });

        const coverageFiles = findCoverageFiles(coverageDir);
        if (coverageFiles.length > 0) {
          this.outputChannel.appendLine(
            `Coverage file generated: ${coverageFiles[0]}`
          );

          await this.reportGenerator.ensureInstalled();

          const reportDir = this.pathResolver.getReportDirectory(coverageDir);
          await this.reportGenerator.generateHtmlReport(
            coverageFiles,
            reportDir,
            workspacePath
          );

          progress.report({ increment: 100 });

          await this.reportGenerator.promptToShowReport(reportDir);
        } else {
          vscode.window.showWarningMessage("No coverage file was generated.");
        }
      }
    );
  }

  private logGenerationStart(
    workspacePath: string,
    targetPath: string | undefined
  ): void {
    this.outputChannel.appendLine(
      "Starting code coverage report generation..."
    );
    this.outputChannel.appendLine(`Workspace: ${workspacePath}`);
    if (targetPath) {
      this.outputChannel.appendLine(`Target: ${targetPath}`);
    }
  }

  private handleError(error: unknown, contextMessage: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.outputChannel.appendLine(`Error: ${errorMessage}`);
    vscode.window.showErrorMessage(`${contextMessage}: ${errorMessage}`);
  }
}
