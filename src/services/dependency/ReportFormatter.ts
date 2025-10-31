import * as vscode from "vscode";
import { UnusedDependencyReport } from "./types";

/**
 * Formats and displays analysis reports
 * Single Responsibility: Report presentation
 */
export class ReportFormatter {
  constructor(private outputChannel: vscode.OutputChannel) {}

  displayReport(report: UnusedDependencyReport): void {
    this.logSeparator();
    this.logInfo("UNUSED DEPENDENCY ANALYSIS REPORT");
    this.logSeparator();
    this.logInfo(`Project: ${report.projectPath}`);
    this.logInfo(`Total Dependencies: ${report.totalDependencies}`);
    this.logInfo(`Scanned Files: ${report.scannedFiles}`);
    this.logInfo(`Unused Dependencies: ${report.unusedDependencies.length}`);
    this.logSeparator();

    if (report.unusedDependencies.length === 0) {
      this.displaySuccessMessage();
    } else {
      this.displayUnusedDependencies(report);
    }
  }

  private displaySuccessMessage(): void {
    this.logInfo("\n✅ Great! No unused dependencies found.");
    vscode.window.showInformationMessage("No unused dependencies found! 🎉");
  }

  private displayUnusedDependencies(report: UnusedDependencyReport): void {
    this.logInfo("\n⚠️  The following dependencies appear to be unused:\n");

    const regularDeps = report.unusedDependencies.filter(
      (d) => d.type === "dependency"
    );
    const devDeps = report.unusedDependencies.filter(
      (d) => d.type === "devDependency"
    );

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

    this.logSeparator();

    this.showWarningWithPrompt(report.unusedDependencies.length);
  }

  private showWarningWithPrompt(count: number): void {
    vscode.window
      .showWarningMessage(
        `Found ${count} unused dependencies. Check the output for details.`,
        "Show Output"
      )
      .then((selection) => {
        if (selection === "Show Output") {
          this.outputChannel.show();
        }
      });
  }

  showError(message: string): void {
    this.logError(`Analysis failed: ${message}`);
    vscode.window.showErrorMessage(`Failed to analyze dependencies: ${message}`);
  }

  logInfo(message: string): void {
    this.outputChannel.appendLine(message);
  }

  private logError(message: string): void {
    this.outputChannel.appendLine(`❌ ${message}`);
  }

  private logSeparator(): void {
    this.outputChannel.appendLine("=".repeat(60));
  }
}
