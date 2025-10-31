import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export interface TestExecutionResult {
  stdout: string;
  stderr: string;
}

/**
 * Executes dotnet test commands
 */
export class TestRunner {
  constructor(private outputChannel: vscode.OutputChannel) {}

  async runTests(
    command: string,
    workingDirectory: string
  ): Promise<TestExecutionResult> {
    this.outputChannel.appendLine(`Command: ${command}`);
    this.outputChannel.appendLine(`Working directory: ${workingDirectory}`);

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: workingDirectory,
        maxBuffer: 1024 * 1024 * 10,
      });

      if (stdout) {
        this.outputChannel.appendLine(stdout);
      }
      if (stderr) {
        this.outputChannel.appendLine(`Stderr: ${stderr}`);
      }

      return { stdout, stderr };
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
  }

  buildTestCommand(
    targetPath: string | undefined,
    coverageDir: string
  ): string {
    if (
      targetPath &&
      (targetPath.endsWith(".sln") || targetPath.endsWith(".csproj"))
    ) {
      return `dotnet test "${targetPath}" --collect:"XPlat Code Coverage" --results-directory "${coverageDir}"`;
    }
    return `dotnet test --collect:"XPlat Code Coverage" --results-directory "${coverageDir}"`;
  }

  buildSimpleTestCommand(): string {
    return `dotnet test --collect:"XPlat Code Coverage"`;
  }
}
