import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import { findTestProjects } from "../../utils";

const execAsync = promisify(exec);

/**
 * Validates .NET environment requirements
 */
export class DotnetValidator {
  async validateDotnetInstalled(): Promise<boolean> {
    try {
      await execAsync("dotnet --version");
      return true;
    } catch (error) {
      return false;
    }
  }

  async validateWorkspace(
    workspaceFolder: vscode.WorkspaceFolder | undefined
  ): Promise<boolean> {
    return workspaceFolder !== undefined;
  }

  async validateTestProjectsExist(workspacePath: string): Promise<string[]> {
    return await findTestProjects(workspacePath);
  }

  showNoWorkspaceError(): void {
    vscode.window.showErrorMessage(
      "No workspace folder found. Please open a .NET project."
    );
  }

  showNoDotnetError(): void {
    vscode.window.showErrorMessage(
      ".NET CLI is not installed or not in PATH."
    );
  }

  showNoTestProjectsError(): void {
    vscode.window.showErrorMessage(
      "No .NET test projects found in the workspace. Make sure you have opened a .NET solution or project containing test projects."
    );
  }

  showNoTestProjectsWarning(targetName: string): void {
    vscode.window.showWarningMessage(
      `No test projects found in ${targetName}. Coverage report requires test projects.`
    );
  }
}
