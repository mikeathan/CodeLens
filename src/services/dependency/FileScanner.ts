import * as fs from "fs";
import * as path from "path";

/**
 * Scans and manages source files in the workspace
 * Single Responsibility: File system scanning
 */
export class FileScanner {
  private readonly SOURCE_EXTENSIONS = [".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs"];
  private readonly EXCLUDED_DIRS = ["node_modules", "dist", "out", "build", ".git", "coverage"];

  getAllSourceFiles(dirPath: string, fileList: string[] = []): string[] {
    if (!this.directoryExists(dirPath)) {
      return fileList;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip excluded directories
        if (!this.EXCLUDED_DIRS.includes(entry.name)) {
          this.getAllSourceFiles(fullPath, fileList);
        }
      } else if (entry.isFile()) {
        // Include only source files
        if (this.isSourceFile(entry.name)) {
          fileList.push(fullPath);
        }
      }
    }

    return fileList;
  }

  countSourceFiles(workspacePath: string): number {
    return this.getAllSourceFiles(workspacePath).length;
  }

  readFile(filePath: string): string {
    return fs.readFileSync(filePath, "utf8");
  }

  private isSourceFile(fileName: string): boolean {
    const ext = path.extname(fileName);
    return this.SOURCE_EXTENSIONS.includes(ext);
  }

  private directoryExists(dirPath: string): boolean {
    return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  }
}
