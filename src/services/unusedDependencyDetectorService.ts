import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export interface UnusedDependency {
  name: string;
  version: string;
  type: "dependencies" | "devDependencies";
  firstSeenPath?: string;
}

export interface UnusedDependenciesResult {
  unused: UnusedDependency[];
  checked: number;
  workspace: string;
  timestamp: number;
}

/**
 * Service for detecting unused NPM dependencies in a workspace
 */
export class UnusedDependencyDetectorService {
  private readonly excludedDirs = [
    "node_modules",
    "dist",
    "out",
    "build",
    "coverage",
    ".git",
    ".vscode",
    ".github"
  ];

  /**
   * Detect unused dependencies in a workspace folder
   * @param workspaceFolder The workspace folder to scan
   * @param token Optional cancellation token
   * @returns Result containing unused dependencies
   */
  async detectUnusedDependencies(
    workspaceFolder: vscode.WorkspaceFolder,
    token?: vscode.CancellationToken
  ): Promise<UnusedDependenciesResult> {
    const packageJsonPath = path.join(workspaceFolder.uri.fsPath, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      return {
        unused: [],
        checked: 0,
        workspace: workspaceFolder.name,
        timestamp: Date.now()
      };
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const allDeps = new Map<string, { version: string; type: "dependencies" | "devDependencies" }>();

    // Collect all dependencies
    if (packageJson.dependencies) {
      Object.entries(packageJson.dependencies).forEach(([name, version]) => {
        allDeps.set(name, { version: version as string, type: "dependencies" });
      });
    }
    if (packageJson.devDependencies) {
      Object.entries(packageJson.devDependencies).forEach(([name, version]) => {
        allDeps.set(name, { version: version as string, type: "devDependencies" });
      });
    }

    // Scan files for imports
    const usedDeps = new Set<string>();
    await this.scanDirectory(workspaceFolder.uri.fsPath, usedDeps, token);

    if (token?.isCancellationRequested) {
      return {
        unused: [],
        checked: 0,
        workspace: workspaceFolder.name,
        timestamp: Date.now()
      };
    }

    // Find unused dependencies
    const unused: UnusedDependency[] = [];
    for (const [name, info] of allDeps.entries()) {
      if (!usedDeps.has(name)) {
        unused.push({
          name,
          version: info.version,
          type: info.type
        });
      }
    }

    return {
      unused,
      checked: allDeps.size,
      workspace: workspaceFolder.name,
      timestamp: Date.now()
    };
  }

  /**
   * Scan a directory recursively for dependency imports
   */
  private async scanDirectory(
    dirPath: string,
    usedDeps: Set<string>,
    token?: vscode.CancellationToken
  ): Promise<void> {
    if (token?.isCancellationRequested) {
      return;
    }

    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (token?.isCancellationRequested) {
          break;
        }

        if (this.excludedDirs.includes(entry.name)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, usedDeps, token);
        } else if (entry.isFile() && this.isSourceFile(entry.name)) {
          await this.scanFile(fullPath, usedDeps);
        }
      }
    } catch (error) {
      // Ignore permission errors and continue
      console.error(`Error scanning directory ${dirPath}:`, error);
    }
  }

  /**
   * Check if a file is a source file we should scan
   */
  private isSourceFile(filename: string): boolean {
    const ext = path.extname(filename).toLowerCase();
    return [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".vue", ".svelte"].includes(ext);
  }

  /**
   * Scan a file for import statements
   */
  private async scanFile(filePath: string, usedDeps: Set<string>): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, "utf8");

      // Match various import patterns
      // import ... from 'package'
      // require('package')
      // import('package')
      const importRegex = /(?:import|require|from)\s*[("']([^"'./][^"']*?)(?:\/[^"']*)?["']/g;
      let match;

      while ((match = importRegex.exec(content)) !== null) {
        const packageName = this.extractPackageName(match[1]);
        if (packageName) {
          usedDeps.add(packageName);
        }
      }
    } catch (error) {
      // Ignore file read errors
      console.error(`Error reading file ${filePath}:`, error);
    }
  }

  /**
   * Extract base package name from import path
   * e.g., "@types/node" -> "@types/node", "lodash/fp" -> "lodash"
   */
  private extractPackageName(importPath: string): string {
    // Handle scoped packages like @types/node
    if (importPath.startsWith("@")) {
      const parts = importPath.split("/");
      if (parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
    }

    // Handle regular packages
    const parts = importPath.split("/");
    return parts[0];
  }
}
