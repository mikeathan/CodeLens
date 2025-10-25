import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import {
  getReflectionScript,
  getProjectContent,
  getProgramContent,
  getBasicFileInfoMessage,
  cleanupTempFile,
  cleanupTempDir,
} from "../utils/assemblyHelpers";

const execAsync = promisify(exec);

export class AssemblyService {
  constructor(private outputChannel: vscode.OutputChannel) {}

  async analyzeAssembly(
    context: vscode.ExtensionContext,
    targetUri?: vscode.Uri
  ): Promise<void> {
    const assemblyPath = await this.getAssemblyPath(targetUri);
    if (!assemblyPath) return;

    if (!(await this.checkDotnetInstalled())) return;

    this.outputChannel.show();
    this.outputChannel.appendLine(`Analyzing assembly: ${assemblyPath}`);

    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Analyzing assembly...",
          cancellable: false,
        },
        async (progress) => {
          progress.report({ increment: 0 });
          const assemblyInfo = await this.getAssemblyInfo(assemblyPath, progress);

          if (assemblyInfo) {
            this.outputChannel.appendLine(assemblyInfo);
            vscode.commands.executeCommand(
              "codelens.showAssemblyInfo",
              assemblyPath,
              assemblyInfo
            );
          }
        }
      );

      vscode.window.showInformationMessage("Assembly analysis completed!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.outputChannel.appendLine(`Error: ${errorMessage}`);
      vscode.window.showErrorMessage(`Failed to analyze assembly: ${errorMessage}`);
    }
  }

  private async getAssemblyPath(targetUri?: vscode.Uri): Promise<string | undefined> {
    if (targetUri) {
      return targetUri.fsPath;
    }

    const fileUri = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { ".NET Assemblies": ["dll", "exe"] },
      title: "Select .NET Assembly",
    });

    if (!fileUri?.[0]) return undefined;

    const assemblyPath = fileUri[0].fsPath;
    if (!assemblyPath.endsWith(".dll") && !assemblyPath.endsWith(".exe")) {
      vscode.window.showErrorMessage(
        "Please select a valid .NET assembly (.dll or .exe file)."
      );
      return undefined;
    }

    return assemblyPath;
  }

  private async checkDotnetInstalled(): Promise<boolean> {
    try {
      await execAsync("dotnet --version");
      return true;
    } catch (error) {
      vscode.window.showErrorMessage(".NET CLI is not installed or not in PATH.");
      return false;
    }
  }

  private async getAssemblyInfo(
    assemblyPath: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
  ): Promise<string | null> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const tempDir = workspaceFolder ? workspaceFolder.uri.fsPath : path.dirname(assemblyPath);
    const tempFile = path.join(tempDir, "temp_assembly_info.cs");

    try {
      fs.writeFileSync(tempFile, getReflectionScript(assemblyPath));
      progress.report({ increment: 30 });

      const { stdout, stderr } = await execAsync(`dotnet script "${tempFile}"`, {
        cwd: tempDir,
        maxBuffer: 1024 * 1024 * 5,
      });

      progress.report({ increment: 100 });
      cleanupTempFile(tempFile);

      if (stderr) {
        this.outputChannel.appendLine(`Warnings: ${stderr}`);
      }

      return stdout || null;
    } catch (scriptError: any) {
      this.outputChannel.appendLine(
        "dotnet-script not available, using alternative analysis method..."
      );

      try {
        return await this.getAssemblyInfoFallback(assemblyPath, tempDir, progress);
      } catch (fallbackError: any) {
        this.outputChannel.appendLine(`Advanced analysis failed: ${fallbackError.message}`);
        this.outputChannel.appendLine("Showing basic file information...");
        return getBasicFileInfoMessage(assemblyPath);
      }
    }
  }

  private async getAssemblyInfoFallback(
    assemblyPath: string,
    tempDir: string,
    progress: vscode.Progress<{ increment?: number; message?: string }>
  ): Promise<string> {
    const tempProjectDir = path.join(tempDir, "temp_assembly_analyzer");
    const tempProjectFile = path.join(tempProjectDir, "temp_assembly_analyzer.csproj");
    const tempProgramFile = path.join(tempProjectDir, "Program.cs");

    if (!fs.existsSync(tempProjectDir)) {
      fs.mkdirSync(tempProjectDir, { recursive: true });
    }

    fs.writeFileSync(tempProjectFile, getProjectContent());
    fs.writeFileSync(tempProgramFile, getProgramContent(assemblyPath));

    progress.report({ increment: 60 });

    const { stdout: runOutput, stderr: runError } = await execAsync(`dotnet run`, {
      cwd: tempProjectDir,
      maxBuffer: 1024 * 1024 * 5,
    });

    progress.report({ increment: 100 });
    cleanupTempDir(tempProjectDir);

    if (runError) {
      this.outputChannel.appendLine(`Warnings: ${runError}`);
    }

    return runOutput || "";
  }
}
