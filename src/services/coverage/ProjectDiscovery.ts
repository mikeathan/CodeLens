import * as vscode from "vscode";
import * as path from "path";

/**
 * Handles project file discovery and selection
 */
export class ProjectDiscovery {
  async findSolutionFiles(): Promise<vscode.Uri[]> {
    return await vscode.workspace.findFiles(
      "**/*.sln",
      "**/node_modules/**",
      5
    );
  }

  async findProjectFiles(): Promise<vscode.Uri[]> {
    return await vscode.workspace.findFiles(
      "**/*.csproj",
      "**/node_modules/**",
      10
    );
  }

  async selectProject(
    workspacePath: string
  ): Promise<{ uri: vscode.Uri; name: string } | undefined> {
    const slnFiles = await this.findSolutionFiles();
    const csprojFiles = await this.findProjectFiles();

    // Single solution file found
    if (slnFiles.length === 1) {
      return {
        uri: slnFiles[0],
        name: path.basename(slnFiles[0].fsPath),
      };
    }

    // Multiple solutions - let user choose
    if (slnFiles.length > 1) {
      return await this.showQuickPick(slnFiles, workspacePath, "Multiple solutions found. Select one:");
    }

    // Single project file found
    if (csprojFiles.length === 1) {
      return {
        uri: csprojFiles[0],
        name: path.basename(csprojFiles[0].fsPath),
      };
    }

    // Multiple projects - let user choose
    if (csprojFiles.length > 1) {
      return await this.showQuickPick(csprojFiles, workspacePath, "Multiple projects found. Select one:");
    }

    // No .NET projects found
    return undefined;
  }

  private async showQuickPick(
    files: vscode.Uri[],
    workspacePath: string,
    placeHolder: string
  ): Promise<{ uri: vscode.Uri; name: string } | undefined> {
    const items = files.map((uri) => ({
      label: path.basename(uri.fsPath),
      description: path.relative(workspacePath, uri.fsPath),
      uri: uri,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder,
    });

    if (!selected) {
      return undefined;
    }

    return {
      uri: selected.uri,
      name: selected.label,
    };
  }

  showNoProjectsWarning(): void {
    vscode.window.showWarningMessage(
      "No .NET solution or project files found in the workspace."
    );
  }
}
