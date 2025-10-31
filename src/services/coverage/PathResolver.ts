import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Manages target path resolution and directory operations
 */
export class PathResolver {
  resolveTargetPath(
    targetUri: vscode.Uri | undefined,
    workspacePath: string
  ): { targetPath: string | undefined; targetDir: string } {
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

    return { targetPath, targetDir };
  }

  ensureCoverageDirectoryExists(workspacePath: string): string {
    const coverageDir = path.join(workspacePath, "coverage");
    if (!fs.existsSync(coverageDir)) {
      fs.mkdirSync(coverageDir, { recursive: true });
    }
    return coverageDir;
  }

  getCoverageReportPath(workspacePath: string): string | null {
    const reportPath = path.join(
      workspacePath,
      "coverage",
      "report",
      "index.html"
    );
    return fs.existsSync(reportPath) ? reportPath : null;
  }

  getReportDirectory(coverageDir: string): string {
    return path.join(coverageDir, "report");
  }
}
