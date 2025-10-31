import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Manages ReportGenerator tool installation and HTML report generation
 */
export class ReportGenerator {
  constructor(private outputChannel: vscode.OutputChannel) {}

  async ensureInstalled(): Promise<void> {
    const isInstalled = await this.checkInstalled();

    if (!isInstalled) {
      await this.install();
    }
  }

  private async checkInstalled(): Promise<boolean> {
    try {
      const { stdout } = await execAsync("dotnet tool list --global");
      return stdout.includes("dotnet-reportgenerator-globaltool");
    } catch (error) {
      return false;
    }
  }

  private async install(): Promise<void> {
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
        this.outputChannel.appendLine("Tool already installed, continuing...");
      } else {
        vscode.window.showErrorMessage(
          "Failed to install ReportGenerator. Check output for details."
        );
        throw installError;
      }
    }
  }

  async generateHtmlReport(
    coverageFiles: string[],
    reportDir: string,
    workspacePath: string
  ): Promise<void> {
    this.outputChannel.appendLine("Generating HTML report...");

    const reportsArg = coverageFiles.join(";");
    const reportCommand = `reportgenerator "-reports:${reportsArg}" "-targetdir:${reportDir}" "-reporttypes:Html"`;

    this.outputChannel.appendLine(`Report command: ${reportCommand}`);

    try {
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

  async promptToShowReport(reportDir: string): Promise<void> {
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
  }
}
