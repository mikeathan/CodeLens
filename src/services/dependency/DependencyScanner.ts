import * as vscode from "vscode";
import { FileScanner } from "./FileScanner";
import { ImportExtractor } from "./ImportExtractor";

/**
 * Scans source files to find used dependencies
 * Single Responsibility: Dependency usage analysis
 */
export class DependencyScanner {
  private fileScanner: FileScanner;
  private importExtractor: ImportExtractor;

  constructor(private outputChannel: vscode.OutputChannel) {
    this.fileScanner = new FileScanner();
    this.importExtractor = new ImportExtractor();
  }

  async scanForUsedDependencies(workspacePath: string): Promise<Set<string>> {
    const usedDependencies = new Set<string>();
    const files = this.fileScanner.getAllSourceFiles(workspacePath);

    for (const file of files) {
      try {
        const content = this.fileScanner.readFile(file);
        const packageNames = this.importExtractor.extractAllPackageNames(content);
        
        packageNames.forEach((name) => usedDependencies.add(name));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logWarning(`Failed to read file ${file}: ${errorMessage}`);
      }
    }

    return usedDependencies;
  }

  getScannedFileCount(workspacePath: string): number {
    return this.fileScanner.countSourceFiles(workspacePath);
  }

  private logWarning(message: string): void {
    this.outputChannel.appendLine(`⚠️  ${message}`);
  }
}
