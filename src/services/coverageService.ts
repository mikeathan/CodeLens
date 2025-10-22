import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { findTestProjects, findCoverageFiles } from "../utils";

const execAsync = promisify(exec);

export class CoverageService {
  constructor(private outputChannel: vscode.OutputChannel) {}

  async generateReport(
    context: vscode.ExtensionContext,
    targetUri?: vscode.Uri
  ): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage(
        "No workspace folder found. Please open a .NET project."
      );
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;

    // Determine the target file/directory for testing
    let targetPath: string | undefined;
    let targetDir: string = workspacePath;

    if (targetUri) {
      targetPath = targetUri.fsPath;
      const stat = fs.statSync(targetPath);

      if (stat.isFile()) {
        // If it's a .sln or .csproj file, use it directly
        if (
          targetPath &&
          (targetPath.endsWith(".sln") || targetPath.endsWith(".csproj"))
        ) {
          targetDir = path.dirname(targetPath);
        }
      } else if (stat.isDirectory()) {
        targetDir = targetPath;
        targetPath = undefined;
      }
    }

    // Check if dotnet is installed
    try {
      await execAsync("dotnet --version");
    } catch (error) {
      vscode.window.showErrorMessage(
        ".NET CLI is not installed or not in PATH."
      );
      return;
    }

    this.outputChannel.show();
    this.outputChannel.appendLine(
      "Starting code coverage report generation..."
    );
    this.outputChannel.appendLine(`Workspace: ${workspacePath}`);
    if (targetPath) {
      this.outputChannel.appendLine(`Target: ${targetPath}`);
    }

    try {
      // Find test projects
      const testProjects = await findTestProjects(workspacePath);
      if (testProjects.length === 0) {
        vscode.window.showWarningMessage(
          "No test projects found in the workspace."
        );
        return;
      }

      this.outputChannel.appendLine(
        `Found ${testProjects.length} test project(s)`
      );

      // Run tests with coverage
      const coverageDir = path.join(workspacePath, "coverage");
      if (!fs.existsSync(coverageDir)) {
        fs.mkdirSync(coverageDir, { recursive: true });
      }

      this.outputChannel.appendLine(
        "Running dotnet test with coverage collection..."
      );

      // Build the command with the target file if provided
      let command: string;
      if (
        targetPath &&
        (targetPath.endsWith(".sln") || targetPath.endsWith(".csproj"))
      ) {
        command = `dotnet test "${targetPath}" --collect:"XPlat Code Coverage" --results-directory "${coverageDir}"`;
      } else {
        command = `dotnet test --collect:"XPlat Code Coverage" --results-directory "${coverageDir}"`;
      }

      this.outputChannel.appendLine(`Command: ${command}`);
      this.outputChannel.appendLine(`Working directory: ${targetDir}`);

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Generating coverage report...",
          cancellable: false,
        },
        async (
          progress: vscode.Progress<{ increment?: number; message?: string }>
        ) => {
          progress.report({ increment: 0 });

          try {
            const { stdout, stderr } = await execAsync(command, {
              cwd: targetDir,
              maxBuffer: 1024 * 1024 * 10,
            });

            if (stdout) {
              this.outputChannel.appendLine(stdout);
            }
            if (stderr) {
              this.outputChannel.appendLine(`Stderr: ${stderr}`);
            }
          } catch (execError: any) {
            this.outputChannel.appendLine(
              `Command failed with exit code: ${execError.code}`
            );
            if (execError.stdout) {
              this.outputChannel.appendLine(`Stdout: ${execError.stdout}`);
            }
            if (execError.stderr) {
              this.outputChannel.appendLine(`Stderr: ${execError.stderr}`);
            }
            throw execError;
          }

          progress.report({ increment: 50 });

          // Find the generated coverage file
          const coverageFiles = findCoverageFiles(coverageDir);
          if (coverageFiles.length > 0) {
            this.outputChannel.appendLine(
              `Coverage file generated: ${coverageFiles[0]}`
            );

            // Check and install ReportGenerator if needed
            await this.ensureReportGeneratorInstalled();

            // Generate HTML report
            await this.generateHtmlReport(
              coverageFiles,
              coverageDir,
              workspacePath,
              progress
            );
          } else {
            vscode.window.showWarningMessage("No coverage file was generated.");
          }
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(
        `Failed to generate coverage report: ${errorMessage}`
      );
    }
  }

  async runTestsWithCoverage(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace folder found.");
      return;
    }

    const workspacePath = workspaceFolder.uri.fsPath;
    this.outputChannel.show();
    this.outputChannel.appendLine("Running tests with coverage...");

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running tests...",
          cancellable: false,
        },
        async (
          progress: vscode.Progress<{ increment?: number; message?: string }>
        ) => {
          const command = `dotnet test --collect:"XPlat Code Coverage"`;
          const { stdout, stderr } = await execAsync(command, {
            cwd: workspacePath,
          });

          if (stdout) {
            this.outputChannel.appendLine(stdout);
          }
          if (stderr) {
            this.outputChannel.appendLine(stderr);
          }

          vscode.window.showInformationMessage(
            "Tests completed. Generate report to view coverage."
          );
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to run tests: ${errorMessage}`);
    }
  }

  getCoverageReportPath(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return null;
    }

    const reportPath = path.join(
      workspaceFolder.uri.fsPath,
      "coverage",
      "report",
      "index.html"
    );
    return fs.existsSync(reportPath) ? reportPath : null;
  }

  private async ensureReportGeneratorInstalled(): Promise<void> {
    let reportGeneratorInstalled = false;
    try {
      const { stdout } = await execAsync("dotnet tool list --global");
      reportGeneratorInstalled = stdout.includes(
        "dotnet-reportgenerator-globaltool"
      );
    } catch (error) {
      // Ignore error, we'll try to install
    }

    if (!reportGeneratorInstalled) {
      this.outputChannel.appendLine(
        "ReportGenerator not found. Installing globally..."
      );
      try {
        const { stdout, stderr } = await execAsync(
          "dotnet tool install --global dotnet-reportgenerator-globaltool"
        );
        this.outputChannel.appendLine(stdout);
        if (stderr) {
          this.outputChannel.appendLine(`Stderr: ${stderr}`);
        }
        vscode.window.showInformationMessage(
          "ReportGenerator installed successfully! Running report generation..."
        );
      } catch (installError: any) {
        this.outputChannel.appendLine(
          `Installation failed: ${installError.message}`
        );
        if (installError.stdout) {
          this.outputChannel.appendLine(`Stdout: ${installError.stdout}`);
        }
        if (installError.stderr) {
          this.outputChannel.appendLine(`Stderr: ${installError.stderr}`);
        }

        // Check if it's already installed
        if (
          installError.message.includes("already installed") ||
          installError.stderr?.includes("already installed")
        ) {
          this.outputChannel.appendLine(
            "Tool already installed, continuing..."
          );
        } else {
          vscode.window.showErrorMessage(
            "Failed to install ReportGenerator. Check output for details."
          );
          throw installError;
        }
      }
    }
  }

  private async generateHtmlReport(
    coverageFiles: string[],
    coverageDir: string,
    workspacePath: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
  ): Promise<void> {
    try {
      this.outputChannel.appendLine("Generating HTML report...");
      const reportDir = path.join(coverageDir, "report");

      // Use all coverage files found - join with semicolon for ReportGenerator
      const reportsArg = coverageFiles.join(";");
      const reportCommand = `reportgenerator "-reports:${reportsArg}" "-targetdir:${reportDir}" "-reporttypes:Html"`;

      this.outputChannel.appendLine(`Report command: ${reportCommand}`);

      const { stdout, stderr } = await execAsync(reportCommand, {
        cwd: workspacePath,
        maxBuffer: 1024 * 1024 * 10,
      });

      if (stdout) {
        this.outputChannel.appendLine(stdout);
      }
      if (stderr) {
        this.outputChannel.appendLine(`Report generation stderr: ${stderr}`);
      }

      this.outputChannel.appendLine(`HTML report generated at: ${reportDir}`);

      progress.report({ increment: 100 });

      const showReport = await vscode.window.showInformationMessage(
        "Coverage report generated successfully!",
        "Show Report",
        "Open Folder"
      );

      if (showReport === "Show Report") {
        vscode.commands.executeCommand("dotnet-coverage.showReport");
      } else if (showReport === "Open Folder") {
        vscode.commands.executeCommand(
          "revealFileInOS",
          vscode.Uri.file(reportDir)
        );
      }
    } catch (error: any) {
      this.outputChannel.appendLine(
        `HTML report generation failed: ${error.message}`
      );
      if (error.stdout) {
        this.outputChannel.appendLine(`Stdout: ${error.stdout}`);
      }
      if (error.stderr) {
        this.outputChannel.appendLine(`Stderr: ${error.stderr}`);
      }
      vscode.window.showErrorMessage(
        "Failed to generate HTML report. Check output for details."
      );
      throw error;
    }
  }
}
